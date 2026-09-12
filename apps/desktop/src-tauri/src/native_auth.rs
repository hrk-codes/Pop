use keyring::Entry;
use uuid::Uuid;

pub const PIPE_NAME: &str = r"\\.\pipe\pop-companion-v3";
const KEYRING_SERVICE: &str = "POP";
const KEYRING_ACCOUNT: &str = "native-host-secret";

pub fn get_or_create_secret() -> Result<String, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|_| "NATIVE_CREDENTIAL_STORE_UNAVAILABLE".to_owned())?;
    if let Ok(secret) = entry.get_password()
        && secret.len() >= 64
    {
        return Ok(secret);
    }
    let secret = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    entry
        .set_password(&secret)
        .map_err(|_| "NATIVE_CREDENTIAL_STORE_WRITE_FAILED".to_owned())?;
    Ok(secret)
}

pub fn load_secret() -> Result<String, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|_| "NATIVE_CREDENTIAL_STORE_UNAVAILABLE".to_owned())?
        .get_password()
        .map_err(|_| "POP_DESKTOP_NOT_INITIALIZED".to_owned())
}
