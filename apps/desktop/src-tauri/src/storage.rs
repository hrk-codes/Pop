use std::{fs, path::Path};

use rusqlite::{Connection, OptionalExtension, params};

use crate::core::PermissionSettings;

pub struct Store {
    connection: Connection,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA journal_mode = WAL;
                 CREATE TABLE IF NOT EXISTS settings (
                   key TEXT PRIMARY KEY NOT NULL,
                   value TEXT NOT NULL,
                   updated_at INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS ai_request_audit (
                   id TEXT PRIMARY KEY NOT NULL,
                   task TEXT NOT NULL,
                   provider TEXT NOT NULL,
                   model TEXT NOT NULL,
                   input_chars INTEGER NOT NULL,
                   output_chars INTEGER NOT NULL,
                   succeeded INTEGER NOT NULL,
                   created_at INTEGER NOT NULL
                 );",
            )
            .map_err(|error| error.to_string())?;
        Ok(Self { connection })
    }

    fn bool_setting(&self, key: &str) -> Result<bool, String> {
        let value = self
            .connection
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|error| error.to_string())?;
        Ok(value.is_some_and(|value| value == "true"))
    }

    pub fn load_permissions(&self) -> Result<PermissionSettings, String> {
        Ok(PermissionSettings {
            monitoring_enabled: self.bool_setting("monitoring_enabled")?,
            x_allowed: self.bool_setting("x_allowed")?,
            vscode_allowed: self.bool_setting("vscode_allowed")?,
        })
    }

    pub fn set_bool(&self, key: &str, value: bool, now: u64) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![key, value.to_string(), now as i64],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn audit_ai_request(
        &self,
        id: &str,
        task: &str,
        provider: &str,
        model: &str,
        input_chars: usize,
        output_chars: usize,
        succeeded: bool,
        now: u64,
    ) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO ai_request_audit
                 (id, task, provider, model, input_chars, output_chars, succeeded, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    id,
                    task,
                    provider,
                    model,
                    input_chars as i64,
                    output_chars as i64,
                    succeeded,
                    now as i64
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}
