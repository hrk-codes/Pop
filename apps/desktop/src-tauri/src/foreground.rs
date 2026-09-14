use std::path::Path;

use windows_sys::Win32::{
    Foundation::{CloseHandle, POINT},
    System::SystemInformation::GetTickCount64,
    System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    },
    UI::{
        Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
        WindowsAndMessaging::{
            GetCursorPos, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
            GetWindowThreadProcessId,
        },
    },
};

#[derive(Debug, Clone)]
pub struct ForegroundIdentity {
    pub application_id: String,
    pub title: String,
}

pub fn foreground_identity() -> Option<ForegroundIdentity> {
    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            return None;
        }

        let mut process_id = 0;
        GetWindowThreadProcessId(window, &mut process_id);
        if process_id == 0 {
            return None;
        }

        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if process.is_null() {
            return None;
        }

        let mut buffer = vec![0_u16; 32_768];
        let mut size = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size);
        CloseHandle(process);
        if result == 0 {
            return None;
        }

        let executable = String::from_utf16_lossy(&buffer[..size as usize]);
        let application_id = Path::new(&executable)
            .file_stem()
            .map(|name| name.to_string_lossy().to_lowercase())?;
        let title_length = GetWindowTextLengthW(window);
        let title = if title_length > 0 {
            let mut title_buffer = vec![0_u16; title_length as usize + 1];
            let copied = GetWindowTextW(window, title_buffer.as_mut_ptr(), title_length + 1);
            String::from_utf16_lossy(&title_buffer[..copied.max(0) as usize])
        } else {
            String::new()
        };
        Some(ForegroundIdentity {
            application_id,
            title,
        })
    }
}

pub fn foreground_application_id() -> Option<String> {
    foreground_identity().map(|identity| identity.application_id)
}

pub fn cursor_position() -> Option<(i32, i32)> {
    unsafe {
        let mut point = POINT::default();
        (GetCursorPos(&mut point) != 0).then_some((point.x, point.y))
    }
}

pub fn idle_ms() -> u64 {
    unsafe {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut info) == 0 {
            return 0;
        }
        (GetTickCount64() as u32).wrapping_sub(info.dwTime) as u64
    }
}

fn privacy_reason_for(application_id: &str, title: &str) -> Option<&'static str> {
    const PRIVATE_APPS: &[&str] = &[
        "1password",
        "authui",
        "bitwarden",
        "credentialuibroker",
        "hxoutlook",
        "keepass",
        "keepassxc",
        "lockapp",
        "logonui",
        "mail",
        "microsoft.photos",
        "olk",
        "outlook",
        "photos",
        "thunderbird",
        "video.ui",
        "vlc",
        "wmplayer",
    ];
    if PRIVATE_APPS.contains(&application_id) {
        return Some("PRIVATE_APPLICATION");
    }

    let title = title.to_lowercase();
    const PRIVATE_TITLES: &[&str] = &[
        "1password",
        "bitwarden",
        "camera roll",
        "credential manager",
        "gmail",
        "google photos",
        "inbox - outlook",
        "keepass",
        "password manager",
        "saved pictures",
    ];
    if PRIVATE_TITLES.iter().any(|needle| title.contains(needle)) {
        return Some("PRIVATE_WINDOW");
    }

    if ["chrome", "firefox", "msedge"].contains(&application_id)
        && [
            ".gif", ".jpeg", ".jpg", ".mkv", ".mov", ".mp4", ".png", ".webp",
        ]
        .iter()
        .any(|extension| title.contains(extension))
    {
        return Some("PRIVATE_MEDIA");
    }

    if application_id == "explorer"
        && ["pictures", "photos", "videos", "camera roll", "private"]
            .iter()
            .any(|needle| title.contains(needle))
    {
        return Some("PRIVATE_FOLDER");
    }
    None
}

pub fn privacy_guard_reason() -> Option<String> {
    let identity = foreground_identity()?;
    privacy_reason_for(&identity.application_id, &identity.title).map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::privacy_reason_for;

    #[test]
    fn blocks_private_native_apps() {
        assert_eq!(
            privacy_reason_for("outlook", "Inbox"),
            Some("PRIVATE_APPLICATION")
        );
        assert_eq!(
            privacy_reason_for("photos", "Holiday"),
            Some("PRIVATE_APPLICATION")
        );
    }

    #[test]
    fn blocks_sensitive_browser_and_explorer_titles() {
        assert_eq!(
            privacy_reason_for("chrome", "Inbox - Gmail"),
            Some("PRIVATE_WINDOW")
        );
        assert_eq!(
            privacy_reason_for("explorer", "Pictures"),
            Some("PRIVATE_FOLDER")
        );
        assert_eq!(
            privacy_reason_for("chrome", "holiday-photo.jpg (1920x1080)"),
            Some("PRIVATE_MEDIA")
        );
    }

    #[test]
    fn leaves_normal_work_surfaces_available() {
        assert_eq!(privacy_reason_for("chrome", "Home / X"), None);
        assert_eq!(privacy_reason_for("code", "POP - Visual Studio Code"), None);
    }
}
