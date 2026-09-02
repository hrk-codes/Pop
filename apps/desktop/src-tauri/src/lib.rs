mod core;
mod foreground;
mod groq;
mod protocol;
mod security;
mod server;
mod storage;

use std::path::PathBuf;

use core::{PopCore, RuntimeSnapshot, now_ms};
use groq::{AssistanceResponse, GroqProvider};
use serde::Serialize;
use storage::Store;
use tauri::{
    AppHandle, Emitter, Manager, State, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use uuid::Uuid;

#[derive(Clone)]
struct ProviderState(Option<GroqProvider>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderHealth {
    configured: bool,
    reachable: bool,
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn emit_snapshot(app: &AppHandle, core: &PopCore) {
    let _ = app.emit("pop://runtime-updated", core.snapshot());
}

#[tauri::command]
fn get_runtime_snapshot(core: State<'_, PopCore>) -> RuntimeSnapshot {
    core.snapshot()
}

#[tauri::command]
fn set_permission(
    key: String,
    value: bool,
    app: AppHandle,
    core: State<'_, PopCore>,
) -> Result<RuntimeSnapshot, String> {
    if !matches!(
        key.as_str(),
        "monitoring_enabled" | "x_allowed" | "vscode_allowed"
    ) {
        return Err("UNKNOWN_SETTING".to_owned());
    }
    core.set_permission(&key, value)?;
    let snapshot = core.snapshot();
    let _ = app.emit("pop://runtime-updated", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn regenerate_pairing_code(app: AppHandle, core: State<'_, PopCore>) -> Result<String, String> {
    let code = core.regenerate_pairing_code()?;
    emit_snapshot(&app, &core);
    Ok(code)
}

#[tauri::command]
async fn provider_health(provider: State<'_, ProviderState>) -> Result<ProviderHealth, String> {
    let Some(provider) = provider.0.clone() else {
        return Ok(ProviderHealth {
            configured: false,
            reachable: false,
        });
    };
    provider.health_check().await?;
    Ok(ProviderHealth {
        configured: true,
        reachable: true,
    })
}

fn task_matches_context(task: &str, kind: protocol::ContextKind) -> bool {
    matches!(
        (task, kind),
        ("IMPROVE_WRITING", protocol::ContextKind::XDraft)
            | ("DRAFT_X_REPLY", protocol::ContextKind::XPost)
            | ("EXPLAIN_CODE", protocol::ContextKind::SelectedCode)
            | ("EXPLAIN_TEXT", protocol::ContextKind::SelectedText)
    )
}

#[tauri::command]
async fn run_assistance(
    task: String,
    tone: String,
    app: AppHandle,
    core: State<'_, PopCore>,
    provider: State<'_, ProviderState>,
) -> Result<AssistanceResponse, String> {
    if !matches!(
        tone.as_str(),
        "natural" | "concise" | "friendly" | "professional"
    ) {
        return Err("UNSUPPORTED_TONE".to_owned());
    }
    let context = core.fresh_context().map_err(str::to_owned)?;
    if !task_matches_context(&task, context.observation.kind) {
        return Err("TASK_CONTEXT_MISMATCH".to_owned());
    }
    let provider = provider.0.clone().ok_or("GROQ_NOT_CONFIGURED")?;
    let request_id = Uuid::new_v4().to_string();
    let _ = app.emit("pop://cloud-activity", true);
    let result = provider
        .generate(&request_id, &task, &tone, &context.observation.text)
        .await;
    let _ = app.emit("pop://cloud-activity", false);

    let (provider_name, model, output_chars, succeeded) = match &result {
        Ok(response) => (
            response.provider.as_str(),
            response.model.as_str(),
            response.outputs.iter().map(String::len).sum(),
            true,
        ),
        Err(_) => ("groq", "unknown", 0, false),
    };
    if let Ok(store) = core.store().lock() {
        let _ = store.audit_ai_request(
            &request_id,
            &task,
            provider_name,
            model,
            context.observation.text.len(),
            output_chars,
            succeeded,
            now_ms(),
        );
    }
    result
}

fn env_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../.env")
}

pub fn run() {
    let _ = dotenvy::from_path(env_path());

    tauri::Builder::default()
        .setup(|app| {
            let database_path = app.path().app_data_dir()?.join("pop.sqlite3");
            let store = Store::open(&database_path).map_err(std::io::Error::other)?;
            let permissions = store.load_permissions().map_err(std::io::Error::other)?;
            let provider = GroqProvider::from_environment().ok();
            let core = PopCore::new(store, permissions, provider.is_some());
            app.manage(core.clone());
            app.manage(ProviderState(provider));

            let server_core = core.clone();
            let server_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = server::run(server_core, server_app.clone()).await {
                    let _ = server_app.emit("pop://runtime-error", error);
                }
            });

            let show_item = MenuItem::with_id(app, "show", "Show POP", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide POP", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit POP", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;
            let tray_icon = app.default_window_icon().cloned().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "POP window icon is missing")
            })?;

            TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("POP")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_snapshot,
            set_permission,
            regenerate_pairing_code,
            provider_health,
            run_assistance
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running POP");
}
