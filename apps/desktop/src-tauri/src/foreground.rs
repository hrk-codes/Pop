use std::path::Path;

use windows_sys::Win32::{
    Foundation::CloseHandle,
    System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    },
    UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};

pub fn foreground_application_id() -> Option<String> {
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
        Path::new(&executable)
            .file_stem()
            .map(|name| name.to_string_lossy().to_lowercase())
    }
}
