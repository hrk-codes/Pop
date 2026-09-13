mod core;
mod foreground;
mod grammar;
mod groq;
mod native_auth;
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
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use uuid::Uuid;

#[derive(Clone)]
struct ProviderState(Option<GroqProvider>);

pub fn native_host_secret() -> Result<String, String> {
    native_auth::load_secret()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderHealth {
    configured: bool,
    reachable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionPreferences {
    avatar_size: u16,
}

fn show_main_window(app: &AppHandle) {
    let core = app.state::<PopCore>();
    let bridge = app.state::<server::NativeBridge>();
    let _ = core.set_suspended(false);
    let snapshot = core.snapshot();
    let _ = app.emit("pop://runtime-updated", &snapshot);
    bridge.publish_control(&snapshot);
    if let Some(window) = app.get_webview_window("avatar") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_companion_windows(app: &AppHandle) {
    for label in ["avatar", "menu", "speech"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.hide();
        }
    }
}

#[tauri::command]
fn get_runtime_snapshot(core: State<'_, PopCore>) -> RuntimeSnapshot {
    core.snapshot()
}

#[tauri::command]
fn get_companion_preferences(core: State<'_, PopCore>) -> Result<CompanionPreferences, String> {
    let store = core.store();
    let size = store
        .lock()
        .map_err(|_| "STORE_UNAVAILABLE".to_owned())?
        .text_setting("avatar_size")?
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|value| matches!(value, 56 | 76 | 104))
        .unwrap_or(76);
    Ok(CompanionPreferences { avatar_size: size })
}

#[tauri::command]
fn set_avatar_size(value: u16, core: State<'_, PopCore>) -> Result<(), String> {
    if !matches!(value, 56 | 76 | 104) {
        return Err("INVALID_AVATAR_SIZE".to_owned());
    }
    core.store()
        .lock()
        .map_err(|_| "STORE_UNAVAILABLE".to_owned())?
        .set_text("avatar_size", &value.to_string(), now_ms())
}

#[tauri::command]
fn set_monitoring(
    value: bool,
    app: AppHandle,
    core: State<'_, PopCore>,
    bridge: State<'_, server::NativeBridge>,
) -> Result<RuntimeSnapshot, String> {
    core.set_monitoring(value)?;
    let snapshot = core.snapshot();
    let _ = app.emit("pop://runtime-updated", &snapshot);
    bridge.publish_control(&snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn set_platform_permission(
    platform_id: protocol::PlatformId,
    value: bool,
    app: AppHandle,
    core: State<'_, PopCore>,
    bridge: State<'_, server::NativeBridge>,
) -> Result<RuntimeSnapshot, String> {
    core.set_platform_permission(platform_id, value)?;
    let snapshot = core.snapshot();
    let _ = app.emit("pop://runtime-updated", &snapshot);
    bridge.publish_control(&snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn hide_surface(label: String, app: AppHandle) -> Result<(), String> {
    app.get_webview_window(&label)
        .ok_or("SURFACE_NOT_FOUND")?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn suspend_to_tray(
    app: AppHandle,
    core: State<'_, PopCore>,
    bridge: State<'_, server::NativeBridge>,
) -> Result<RuntimeSnapshot, String> {
    core.set_suspended(true)?;
    let snapshot = core.snapshot();
    let _ = app.emit("pop://runtime-updated", &snapshot);
    bridge.publish_control(&snapshot);
    hide_companion_windows(&app);
    Ok(snapshot)
}

fn anchor_surface(app: &AppHandle, label: &str) -> Result<(), String> {
    let avatar = app.get_webview_window("avatar").ok_or("AVATAR_NOT_FOUND")?;
    let target = app.get_webview_window(label).ok_or("SURFACE_NOT_FOUND")?;
    let origin = avatar.outer_position().map_err(|error| error.to_string())?;
    let avatar_size = avatar.outer_size().map_err(|error| error.to_string())?;
    let target_size = target.outer_size().map_err(|error| error.to_string())?;
    let (x, y) = match label {
        "menu" => (origin.x + avatar_size.width as i32 - 16, origin.y),
        "speech" => (
            origin.x + avatar_size.width as i32 - target_size.width as i32,
            origin.y - target_size.height as i32 + 24,
        ),
        _ => (origin.x, origin.y),
    };
    target
        .set_position(PhysicalPosition::new(x.max(0), y.max(0)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn show_surface(label: String, app: AppHandle) -> Result<(), String> {
    anchor_surface(&app, &label)?;
    app.get_webview_window(&label)
        .ok_or("SURFACE_NOT_FOUND")?
        .show()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn toggle_surface(label: String, app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(&label).ok_or("SURFACE_NOT_FOUND")?;
    if window.is_visible().map_err(|error| error.to_string())? {
        window.hide().map_err(|error| error.to_string())
    } else {
        anchor_surface(&app, &label)?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())
    }
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
            | ("SHORTEN", protocol::ContextKind::DraftText)
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
    let cancellation = core.begin_generation();
    let _ = app.emit(
        "pop://assistance-started",
        serde_json::json!({
            "requestId": request_id,
            "task": task,
            "provider": "groq",
            "model": provider.model(),
        }),
    );
    let _ = app.emit("pop://cloud-activity", true);
    let stream_app = app.clone();
    let stream_request_id = request_id.clone();
    let result = provider
        .generate_stream(
            &request_id,
            &task,
            &tone,
            &context.observation.text,
            cancellation,
            move |delta| {
                let _ = stream_app.emit(
                    "pop://assistance-chunk",
                    serde_json::json!({ "requestId": stream_request_id, "delta": delta }),
                );
            },
        )
        .await;
    let _ = app.emit("pop://cloud-activity", false);

    if let Ok(response) = &result
        && let Some(output) = response.outputs.first()
    {
        let _ = app.emit(
            "pop://assistance-complete",
            serde_json::json!({
                "requestId": response.request_id,
                "output": output,
                "task": task,
                "provider": response.provider,
                "model": response.model,
            }),
        );
    }

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

            let bridge = server::NativeBridge::new();
            app.manage(bridge.clone());
            let native_secret =
                native_auth::get_or_create_secret().map_err(std::io::Error::other)?;

            WebviewWindowBuilder::new(app, "avatar", WebviewUrl::App("index.html".into()))
                .title("POP")
                .inner_size(140.0, 140.0)
                .always_on_top(true)
                .center()
                .decorations(false)
                .resizable(false)
                .shadow(false)
                .skip_taskbar(true)
                .transparent(true)
                .build()?;
            if let Some(window) = app.get_webview_window("avatar")
                && let Ok(store) = core.store().lock()
            {
                let x = store
                    .text_setting("avatar_x")
                    .ok()
                    .flatten()
                    .and_then(|value| value.parse::<i32>().ok());
                let y = store
                    .text_setting("avatar_y")
                    .ok()
                    .flatten()
                    .and_then(|value| value.parse::<i32>().ok());
                if let (Some(x), Some(y)) = (x, y) {
                    let _ = window.set_position(PhysicalPosition::new(x.max(0), y.max(0)));
                }
            }
            for (label, title, width, height) in [
                ("speech", "POP response", 360.0, 220.0),
                ("menu", "POP menu", 284.0, 430.0),
            ] {
                WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
                    .title(title)
                    .inner_size(width, height)
                    .always_on_top(true)
                    .decorations(false)
                    .resizable(false)
                    .shadow(false)
                    .skip_taskbar(true)
                    .transparent(true)
                    .visible(false)
                    .build()?;
            }

            let server_core = core.clone();
            let server_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    server::run(server_core, server_app.clone(), native_secret, bridge).await
                {
                    let _ = server_app.emit("pop://runtime-error", error);
                }
            });

            let show_item =
                MenuItem::with_id(app, "show", "Show and resume POP", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Minimize POP", true, None::<&str>)?;
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
                        let core = app.state::<PopCore>();
                        let bridge = app.state::<server::NativeBridge>();
                        let _ = core.set_suspended(true);
                        let snapshot = core.snapshot();
                        let _ = app.emit("pop://runtime-updated", &snapshot);
                        bridge.publish_control(&snapshot);
                        hide_companion_windows(app);
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
            get_companion_preferences,
            set_avatar_size,
            set_monitoring,
            set_platform_permission,
            hide_surface,
            suspend_to_tray,
            show_surface,
            toggle_surface,
            provider_health,
            check_writing,
            run_assistance,
            record_copy_preference,
            get_learned_habits,
            forget_habit
        ])
        .on_window_event(|window, event| {
            if window.label() == "avatar"
                && let WindowEvent::Moved(position) = event
            {
                let core = window.app_handle().state::<PopCore>();
                if let Ok(store) = core.store().lock() {
                    let _ = store.set_text("avatar_x", &position.x.to_string(), now_ms());
                    let _ = store.set_text("avatar_y", &position.y.to_string(), now_ms());
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running POP");
}
