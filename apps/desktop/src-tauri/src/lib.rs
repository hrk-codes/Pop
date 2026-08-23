use tauri::{
    Manager, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
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
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running POP");
}
