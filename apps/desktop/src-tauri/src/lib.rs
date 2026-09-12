mod core;
mod foreground;
mod grammar;
mod groq;
mod protocol;
mod security;
mod server;
mod storage;

use std::path::PathBuf;

use core::{PopCore, RuntimeSnapshot, now_ms};
use grammar::WritingAnalysis;
use groq::{AssistanceResponse, GroqProvider};
use serde::Serialize;
use storage::{LearnedHabit, Store};
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
fn set_monitoring(
    value: bool,
    app: AppHandle,
    core: State<'_, PopCore>,
) -> Result<RuntimeSnapshot, String> {
    core.set_monitoring(value)?;
    let snapshot = core.snapshot();
    let _ = app.emit("pop://runtime-updated", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn set_platform_permission(
    platform_id: protocol::PlatformId,
    value: bool,
    app: AppHandle,
    core: State<'_, PopCore>,
) -> Result<RuntimeSnapshot, String> {
    core.set_platform_permission(platform_id, value)?;
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
        ("IMPROVE_WRITING", protocol::ContextKind::DraftText)
            | ("IMPROVE_WRITING", protocol::ContextKind::SearchQuery)
            | ("DRAFT_REPLY", protocol::ContextKind::SocialPost)
            | ("DRAFT_REPLY", protocol::ContextKind::Conversation)
            | ("EXPLAIN_CODE", protocol::ContextKind::SelectedCode)
            | ("REVIEW_CODE", protocol::ContextKind::SelectedCode)
            | ("EXPLAIN_TEXT", protocol::ContextKind::SelectedText)
            | ("EXPLAIN_TEXT", protocol::ContextKind::ArticleText)
            | ("EXPLAIN_TEXT", protocol::ContextKind::SocialPost)
            | ("EXPLAIN_TEXT", protocol::ContextKind::Conversation)
            | ("SUMMARIZE", protocol::ContextKind::SelectedText)
            | ("SUMMARIZE", protocol::ContextKind::ArticleText)
            | ("SUMMARIZE", protocol::ContextKind::SocialPost)
            | ("SUMMARIZE", protocol::ContextKind::Conversation)
    )
}

#[tauri::command]
async fn check_writing(core: State<'_, PopCore>) -> Result<WritingAnalysis, String> {
    let context = core.fresh_context().map_err(str::to_owned)?;
    if !matches!(
        context.observation.kind,
        protocol::ContextKind::DraftText | protocol::ContextKind::SearchQuery
    ) {
        return Err("WRITING_CONTEXT_REQUIRED".to_owned());
    }
    let text = context.observation.text;
    tauri::async_runtime::spawn_blocking(move || grammar::analyze(&text))
        .await
        .map_err(|_| "GRAMMAR_ENGINE_FAILED".to_owned())
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

#[tauri::command]
fn record_copy_preference(
    task: String,
    tone: String,
    output_chars: usize,
    core: State<'_, PopCore>,
) -> Result<Vec<LearnedHabit>, String> {
    if task.len() > 40 || tone.len() > 20 || output_chars > 100_000 {
        return Err("INVALID_PREFERENCE_SIGNAL".to_owned());
    }
    let store = core.store();
    let store = store.lock().map_err(|_| "STORE_UNAVAILABLE".to_owned())?;
    store.record_copy_preference(&task, &tone, output_chars, now_ms())?;
    store.learned_habits()
}

#[tauri::command]
fn get_learned_habits(core: State<'_, PopCore>) -> Result<Vec<LearnedHabit>, String> {
    let store = core.store();
    store
        .lock()
        .map_err(|_| "STORE_UNAVAILABLE".to_owned())?
        .learned_habits()
}

#[tauri::command]
fn forget_habit(id: String, core: State<'_, PopCore>) -> Result<Vec<LearnedHabit>, String> {
    if id.len() > 100 {
        return Err("INVALID_HABIT_ID".to_owned());
    }
    let store = core.store();
    let store = store.lock().map_err(|_| "STORE_UNAVAILABLE".to_owned())?;
    store.forget_habit(&id)?;
    store.learned_habits()
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

            tauri::async_runtime::spawn_blocking(grammar::warm_up);

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
            set_monitoring,
            set_platform_permission,
            regenerate_pairing_code,
            provider_health,
            check_writing,
            run_assistance,
            record_copy_preference,
            get_learned_habits,
            forget_habit
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
