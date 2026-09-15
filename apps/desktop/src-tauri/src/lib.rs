mod core;
mod foreground;
mod grammar;
mod groq;
mod native_auth;
mod protocol;
mod security;
mod server;
mod storage;

use std::{path::PathBuf, time::Duration};

use core::{PopCore, RuntimeSnapshot, now_ms};
use grammar::WritingAnalysis;
use groq::{AssistanceResponse, GroqProvider};
use serde::Serialize;
use storage::{LearnedHabit, Store};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
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
    personality_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionAwareness {
    gaze_x: f64,
    gaze_y: f64,
    idle_ms: u64,
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

fn hide_context_windows(app: &AppHandle) {
    for label in ["menu", "speech"] {
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
    let store = store.lock().map_err(|_| "STORE_UNAVAILABLE".to_owned())?;
    let size = store
        .text_setting("avatar_size")?
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|value| matches!(value, 56 | 76 | 104))
        .unwrap_or(76);
    let personality_enabled = store
        .text_setting("personality_enabled")?
        .map(|value| value == "true")
        .unwrap_or(true);
    Ok(CompanionPreferences {
        avatar_size: size,
        personality_enabled,
    })
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
fn set_personality_enabled(value: bool, core: State<'_, PopCore>) -> Result<(), String> {
    core.store()
        .lock()
        .map_err(|_| "STORE_UNAVAILABLE".to_owned())?
        .set_bool("personality_enabled", value, now_ms())
}

#[tauri::command]
fn get_companion_awareness(app: AppHandle) -> Result<CompanionAwareness, String> {
    let avatar = app.get_webview_window("avatar").ok_or("AVATAR_NOT_FOUND")?;
    let origin = avatar.outer_position().map_err(|error| error.to_string())?;
    let window_size = avatar.outer_size().map_err(|error| error.to_string())?;
    let scale = avatar.scale_factor().map_err(|error| error.to_string())?;
    let bounds = visible_avatar_bounds(origin, window_size, scale);
    let center_x = bounds.0 as f64 + bounds.2 as f64 / 2.0;
    let center_y = bounds.1 as f64 + bounds.3 as f64 / 2.0;
    let (cursor_x, cursor_y) =
        foreground::cursor_position().unwrap_or((center_x as i32, center_y as i32));
    Ok(CompanionAwareness {
        gaze_x: ((cursor_x as f64 - center_x) / 420.0).clamp(-1.0, 1.0),
        gaze_y: ((cursor_y as f64 - center_y) / 300.0).clamp(-1.0, 1.0),
        idle_ms: foreground::idle_ms(),
    })
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

fn calculate_anchor(
    avatar: (i32, i32, u32, u32),
    target: (u32, u32),
    work_area: (i32, i32, u32, u32),
) -> (i32, i32) {
    const GAP: i32 = 8;
    const MARGIN: i32 = 8;

    let (avatar_x, avatar_y, avatar_width, avatar_height) = avatar;
    let (target_width, target_height) = (target.0 as i32, target.1 as i32);
    let (work_left, work_top, work_width, work_height) = work_area;
    let work_right = work_left + work_width as i32;
    let work_bottom = work_top + work_height as i32;
    let avatar_right = avatar_x + avatar_width as i32;
    let avatar_center_y = avatar_y + avatar_height as i32 / 2;

    let right_candidate = avatar_right + GAP;
    let left_candidate = avatar_x - target_width - GAP;
    let right_fits = right_candidate + target_width <= work_right - MARGIN;
    let left_fits = left_candidate >= work_left + MARGIN;
    let preferred_x = if right_fits || !left_fits {
        right_candidate
    } else {
        left_candidate
    };

    let min_x = work_left + MARGIN;
    let max_x = (work_right - MARGIN - target_width).max(min_x);
    let min_y = work_top + MARGIN;
    let max_y = (work_bottom - MARGIN - target_height).max(min_y);
    (
        preferred_x.clamp(min_x, max_x),
        (avatar_center_y - target_height / 2).clamp(min_y, max_y),
    )
}

fn visible_avatar_bounds(
    origin: PhysicalPosition<i32>,
    window_size: tauri::PhysicalSize<u32>,
    scale: f64,
) -> (i32, i32, u32, u32) {
    let desired_inset = (20.0 * scale).round() as u32;
    let inset_x = desired_inset.min(window_size.width.saturating_sub(1) / 2);
    let inset_y = desired_inset.min(window_size.height.saturating_sub(1) / 2);
    (
        origin.x + inset_x as i32,
        origin.y + inset_y as i32,
        window_size.width.saturating_sub(inset_x * 2),
        window_size.height.saturating_sub(inset_y * 2),
    )
}

fn anchor_surface(app: &AppHandle, label: &str) -> Result<(), String> {
    let avatar = app.get_webview_window("avatar").ok_or("AVATAR_NOT_FOUND")?;
    let target = app.get_webview_window(label).ok_or("SURFACE_NOT_FOUND")?;
    let origin = avatar.outer_position().map_err(|error| error.to_string())?;
    let avatar_window_size = avatar.outer_size().map_err(|error| error.to_string())?;
    let avatar_scale = avatar.scale_factor().map_err(|error| error.to_string())?;
    let avatar_bounds = visible_avatar_bounds(origin, avatar_window_size, avatar_scale);
    let target_size = target.outer_size().map_err(|error| error.to_string())?;
    let monitor = avatar
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or("MONITOR_NOT_FOUND")?;
    let work_area = monitor.work_area();
    let (x, y) = calculate_anchor(
        avatar_bounds,
        (target_size.width, target_size.height),
        (
            work_area.position.x,
            work_area.position.y,
            work_area.size.width,
            work_area.size.height,
        ),
    );

    target
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;

    if label == "speech" {
        let side = if x >= avatar_bounds.0 + avatar_bounds.2 as i32 {
            "left"
        } else {
            "right"
        };
        let scale = target.scale_factor().unwrap_or(1.0);
        let avatar_center_y = avatar_bounds.1 + avatar_bounds.3 as i32 / 2;
        let tail_y = ((avatar_center_y - y) as f64 / scale)
            .clamp(24.0, (target_size.height as f64 / scale - 24.0).max(24.0));
        let _ = target.emit(
            "pop://surface-anchor",
            serde_json::json!({ "side": side, "tailY": tail_y }),
        );
    }

    Ok(())
}

#[cfg(test)]
mod window_placement_tests {
    use super::{calculate_anchor, visible_avatar_bounds};
    use tauri::{PhysicalPosition, PhysicalSize};

    #[test]
    fn anchors_to_the_visible_avatar_instead_of_transparent_window_padding() {
        assert_eq!(
            visible_avatar_bounds(
                PhysicalPosition::new(100, 200),
                PhysicalSize::new(116, 116),
                1.0
            ),
            (120, 220, 76, 76)
        );
    }

    #[test]
    fn opens_on_the_right_when_space_is_available() {
        assert_eq!(
            calculate_anchor((100, 400, 116, 116), (284, 430), (0, 0, 1920, 1040)),
            (224, 243)
        );
    }

    #[test]
    fn flips_left_and_clamps_inside_the_work_area_at_a_corner() {
        assert_eq!(
            calculate_anchor((1800, 950, 116, 116), (284, 430), (0, 0, 1920, 1040)),
            (1508, 602)
        );
    }

    #[test]
    fn supports_monitors_with_negative_coordinates() {
        assert_eq!(
            calculate_anchor(
                (-120, -900, 116, 116),
                (284, 430),
                (-1920, -1080, 1920, 1040)
            ),
            (-412, -1057)
        );
    }
}

fn reposition_visible_surfaces(app: &AppHandle) {
    for label in ["menu", "speech"] {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        if window.is_visible().unwrap_or(false) {
            let _ = anchor_surface(app, label);
        }
    }
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
fn resize_speech_surface(width: f64, height: f64, app: AppHandle) -> Result<(), String> {
    if !width.is_finite()
        || !height.is_finite()
        || !(260.0..=540.0).contains(&width)
        || !(108.0..=700.0).contains(&height)
    {
        return Err("INVALID_SPEECH_SIZE".to_owned());
    }
    let window = app
        .get_webview_window("speech")
        .ok_or("SURFACE_NOT_FOUND")?;
    let monitor = app
        .get_webview_window("avatar")
        .ok_or("AVATAR_NOT_FOUND")?
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or("MONITOR_NOT_FOUND")?;
    let scale = monitor.scale_factor();
    let max_width = (monitor.work_area().size.width as f64 / scale - 24.0).max(260.0);
    let max_height = (monitor.work_area().size.height as f64 / scale - 24.0).max(108.0);
    window
        .set_size(LogicalSize::new(
            width.min(max_width),
            height.min(max_height),
        ))
        .map_err(|error| error.to_string())?;
    anchor_surface(&app, "speech")
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
            | ("DRAFT_REPLY", protocol::ContextKind::SelectedText)
            | ("DRAFT_REPLY", protocol::ContextKind::ArticleText)
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

#[cfg(test)]
mod task_context_tests {
    use super::{protocol::ContextKind, task_matches_context};

    #[test]
    fn selected_web_text_can_be_explained_or_used_for_a_reply() {
        for kind in [
            ContextKind::SocialPost,
            ContextKind::SelectedText,
            ContextKind::ArticleText,
        ] {
            assert!(task_matches_context("EXPLAIN_TEXT", kind));
            assert!(task_matches_context("DRAFT_REPLY", kind));
        }
    }

    #[test]
    fn writing_drafts_do_not_cross_into_reply_context() {
        assert!(task_matches_context(
            "IMPROVE_WRITING",
            ContextKind::DraftText
        ));
        assert!(!task_matches_context("DRAFT_REPLY", ContextKind::DraftText));
    }
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
    variant: u8,
    app: AppHandle,
    core: State<'_, PopCore>,
    provider: State<'_, ProviderState>,
) -> Result<AssistanceResponse, String> {
    if variant > 20 {
        return Err("INVALID_VARIANT".to_owned());
    }
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
            &context.observation,
            variant,
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
                    let _ = window.set_position(PhysicalPosition::new(x, y));
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
            let server_bridge = bridge.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = server::run(
                    server_core,
                    server_app.clone(),
                    native_secret,
                    server_bridge,
                )
                .await
                {
                    let _ = server_app.emit("pop://runtime-error", error);
                }
            });

            let loopback_core = core.clone();
            let loopback_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = server::run_loopback(loopback_core, loopback_app.clone()).await
                {
                    let _ = loopback_app.emit("pop://runtime-error", error);
                }
            });

            let privacy_core = core.clone();
            let privacy_app = app.handle().clone();
            let privacy_bridge = bridge.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_millis(600));
                loop {
                    interval.tick().await;
                    let current = privacy_core.snapshot();
                    let should_watch = current.permissions.monitoring_enabled && !current.suspended;
                    let reason = should_watch
                        .then(foreground::privacy_guard_reason)
                        .flatten();
                    let active = reason.is_some();
                    if privacy_core
                        .set_privacy_guard(active, reason)
                        .unwrap_or(false)
                    {
                        let snapshot = privacy_core.snapshot();
                        if snapshot.privacy_paused {
                            hide_context_windows(&privacy_app);
                        }
                        let _ = privacy_app.emit("pop://runtime-updated", &snapshot);
                        privacy_bridge.publish_control(&snapshot);
                    }
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
            set_personality_enabled,
            get_companion_awareness,
            set_monitoring,
            set_platform_permission,
            hide_surface,
            suspend_to_tray,
            show_surface,
            resize_speech_surface,
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
                reposition_visible_surfaces(window.app_handle());
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running POP");
}
