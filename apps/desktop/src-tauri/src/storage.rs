use std::{fs, path::Path};

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use crate::{core::PermissionSettings, protocol::PlatformId};

pub struct Store {
    connection: Connection,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearnedHabit {
    pub id: String,
    pub label: String,
    pub evidence_count: u32,
    pub confidence: f32,
    pub updated_at: u64,
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
                 );
                 CREATE TABLE IF NOT EXISTS preference_stats (
                   id TEXT PRIMARY KEY NOT NULL,
                   label TEXT NOT NULL,
                   evidence_count INTEGER NOT NULL,
                   updated_at INTEGER NOT NULL
                 );",
            )
            .map_err(|error| error.to_string())?;
        Ok(Self { connection })
    }

    fn optional_bool_setting(&self, key: &str) -> Result<Option<bool>, String> {
        let value = self
            .connection
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|error| error.to_string())?;
        Ok(value.map(|value| value == "true"))
    }

    fn bool_setting(&self, key: &str) -> Result<bool, String> {
        Ok(self.optional_bool_setting(key)?.unwrap_or(false))
    }

    pub fn text_setting(&self, key: &str) -> Result<Option<String>, String> {
        self.connection
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn load_permissions(&self) -> Result<PermissionSettings, String> {
        let mut settings = PermissionSettings::denied();
        settings.monitoring_enabled = self.bool_setting("monitoring_enabled")?;
        for platform in PlatformId::ALL {
            let legacy_key = match platform {
                PlatformId::X => Some("x_allowed"),
                PlatformId::Vscode => Some("vscode_allowed"),
                _ => None,
            };
            let enabled = match self.optional_bool_setting(platform.setting_key())? {
                Some(value) => value,
                None => match legacy_key {
                    Some(key) => self.bool_setting(key)?,
                    None => false,
                },
            };
            settings.platforms.insert(platform, enabled);
        }
        Ok(settings)
    }

    pub fn set_bool(&self, key: &str, value: bool, now: u64) -> Result<(), String> {
        self.set_text(key, &value.to_string(), now)
    }

    pub fn set_text(&self, key: &str, value: &str, now: u64) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![key, value, now as i64],
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

    pub fn record_copy_preference(
        &self,
        task: &str,
        tone: &str,
        output_chars: usize,
        now: u64,
    ) -> Result<(), String> {
        let length = match output_chars {
            0..=160 => "concise",
            161..=480 => "standard",
            _ => "detailed",
        };
        let task_label = task.to_ascii_lowercase().replace('_', " ");
        let habits = [
            (
                format!("tone:{task}:{tone}"),
                format!("Prefers {tone} tone for {task_label}"),
            ),
            (
                format!("length:{task}:{length}"),
                format!("Prefers {length} responses for {task_label}"),
            ),
        ];
        for (id, label) in habits {
            self.connection
                .execute(
                    "INSERT INTO preference_stats (id, label, evidence_count, updated_at)
                     VALUES (?1, ?2, 1, ?3)
                     ON CONFLICT(id) DO UPDATE SET
                       evidence_count = evidence_count + 1,
                       updated_at = excluded.updated_at",
                    params![id, label, now as i64],
                )
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub fn learned_habits(&self) -> Result<Vec<LearnedHabit>, String> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, label, evidence_count, updated_at
                 FROM preference_stats ORDER BY evidence_count DESC, updated_at DESC",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                let evidence_count = row.get::<_, u32>(2)?;
                Ok(LearnedHabit {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    evidence_count,
                    confidence: (evidence_count as f32 / 5.0).min(1.0),
                    updated_at: row.get::<_, i64>(3)? as u64,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn forget_habit(&self, id: &str) -> Result<(), String> {
        self.connection
            .execute("DELETE FROM preference_stats WHERE id = ?1", [id])
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, process, time::SystemTime};

    use super::Store;

    #[test]
    fn preference_learning_stores_only_derived_signals() {
        let nonce = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("pop-memory-{}-{nonce}.sqlite3", process::id()));
        let store = Store::open(&path).expect("store should open");

        store
            .record_copy_preference("DRAFT_REPLY", "natural", 120, 42)
            .expect("preference should be recorded");
        let habits = store.learned_habits().expect("habits should load");

        assert_eq!(habits.len(), 2);
        assert!(
            habits
                .iter()
                .all(|habit| !habit.label.contains("private draft"))
        );
        store
            .forget_habit(&habits[0].id)
            .expect("habit should be forgettable");
        assert_eq!(
            store.learned_habits().expect("habits should reload").len(),
            1
        );

        drop(store);
        let _ = fs::remove_file(path);
    }
}
