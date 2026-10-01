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

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReplyLearningProfile {
    pub sample_count: u32,
    pub angle: Option<String>,
    pub length: Option<String>,
    pub shape: Option<String>,
    pub casing: Option<String>,
    pub emoji: Option<String>,
    pub punctuation: Option<String>,
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
                   created_at INTEGER NOT NULL,
                   error_code TEXT
                 );
                 CREATE TABLE IF NOT EXISTS preference_stats (
                   id TEXT PRIMARY KEY NOT NULL,
                   label TEXT NOT NULL,
                   evidence_count INTEGER NOT NULL,
                   updated_at INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS accepted_response_choices (
                   request_id TEXT PRIMARY KEY NOT NULL,
                   task TEXT NOT NULL,
                   context_kind TEXT NOT NULL,
                   acceptance_source TEXT NOT NULL,
                   created_at INTEGER NOT NULL
                 );",
            )
            .map_err(|error| error.to_string())?;
        let has_error_code: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('ai_request_audit') WHERE name = 'error_code')",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if !has_error_code {
            connection
                .execute(
                    "ALTER TABLE ai_request_audit ADD COLUMN error_code TEXT",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
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
        error_code: Option<&str>,
    ) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO ai_request_audit
                 (id, task, provider, model, input_chars, output_chars, succeeded, created_at, error_code)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    id,
                    task,
                    provider,
                    model,
                    input_chars as i64,
                    output_chars as i64,
                    succeeded,
                    now as i64,
                    error_code
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

    #[allow(clippy::too_many_arguments)]
    pub fn record_response_choice(
        &self,
        request_id: &str,
        task: &str,
        context_kind: &str,
        variant: u8,
        output: &str,
        acceptance_source: &str,
        now: u64,
    ) -> Result<bool, String> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        let inserted = transaction
            .execute(
                "INSERT OR IGNORE INTO accepted_response_choices
                 (request_id, task, context_kind, acceptance_source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    request_id,
                    task,
                    context_kind,
                    acceptance_source,
                    now as i64
                ],
            )
            .map_err(|error| error.to_string())?;
        if inserted == 0 {
            return Ok(false);
        }

        let trimmed = output.trim();
        let output_chars = trimmed.chars().count();
        let length = match output_chars {
            0..=80 => "brief",
            81..=180 => "compact",
            _ => "developed",
        };
        let angle = match variant % 6 {
            0 => "direct",
            1 => "practical",
            2 => "playful",
            3 => "counterpoint",
            4 => "question-led",
            _ => "analogy",
        };
        let shape = if trimmed.ends_with('?') {
            "question"
        } else {
            "statement"
        };
        let casing = trimmed
            .chars()
            .find(|character| character.is_alphabetic())
            .map(|character| {
                if character.is_lowercase() {
                    "lowercase"
                } else {
                    "standard"
                }
            })
            .unwrap_or("standard");
        let emoji = if trimmed.chars().any(is_emoji_like) {
            "emoji"
        } else {
            "no-emoji"
        };
        let punctuation = if trimmed.contains('!') {
            "expressive"
        } else {
            "calm"
        };

        for scope in [context_kind, "ANY"] {
            let prefix = format!("learning:{task}:{scope}");
            let signals = [
                ("accepted", "chosen", "Chosen replies"),
                ("angle", angle, angle_label(angle)),
                ("length", length, length_label(length)),
                ("shape", shape, shape_label(shape)),
                ("casing", casing, casing_label(casing)),
                ("emoji", emoji, emoji_label(emoji)),
                ("punctuation", punctuation, punctuation_label(punctuation)),
            ];
            for (dimension, value, label) in signals {
                let id = format!("{prefix}:{dimension}:{value}");
                transaction
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
        }
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(true)
    }

    pub fn reply_learning_profile(
        &self,
        task: &str,
        context_kind: &str,
    ) -> Result<ReplyLearningProfile, String> {
        let contextual_prefix = format!("learning:{task}:{context_kind}");
        let contextual_count =
            self.preference_count(&format!("{contextual_prefix}:accepted:chosen"))?;
        let prefix = if contextual_count >= 4 {
            contextual_prefix
        } else {
            format!("learning:{task}:ANY")
        };
        let sample_count = self.preference_count(&format!("{prefix}:accepted:chosen"))?;
        if sample_count < 4 {
            return Ok(ReplyLearningProfile {
                sample_count,
                ..ReplyLearningProfile::default()
            });
        }

        Ok(ReplyLearningProfile {
            sample_count,
            angle: self.dominant_value(
                &prefix,
                "angle",
                &[
                    "direct",
                    "practical",
                    "playful",
                    "counterpoint",
                    "question-led",
                    "analogy",
                ],
                sample_count,
            )?,
            length: self.dominant_value(
                &prefix,
                "length",
                &["brief", "compact", "developed"],
                sample_count,
            )?,
            shape: self.dominant_value(
                &prefix,
                "shape",
                &["question", "statement"],
                sample_count,
            )?,
            casing: self.dominant_value(
                &prefix,
                "casing",
                &["lowercase", "standard"],
                sample_count,
            )?,
            emoji: self.dominant_value(&prefix, "emoji", &["emoji", "no-emoji"], sample_count)?,
            punctuation: self.dominant_value(
                &prefix,
                "punctuation",
                &["expressive", "calm"],
                sample_count,
            )?,
        })
    }

    fn preference_count(&self, id: &str) -> Result<u32, String> {
        self.connection
            .query_row(
                "SELECT evidence_count FROM preference_stats WHERE id = ?1",
                [id],
                |row| row.get::<_, u32>(0),
            )
            .optional()
            .map(|value| value.unwrap_or(0))
            .map_err(|error| error.to_string())
    }

    fn dominant_value(
        &self,
        prefix: &str,
        dimension: &str,
        values: &[&str],
        sample_count: u32,
    ) -> Result<Option<String>, String> {
        let mut counts = Vec::with_capacity(values.len());
        for value in values {
            let count = self.preference_count(&format!("{prefix}:{dimension}:{value}"))?;
            counts.push((*value, count));
        }
        counts.sort_by(|left, right| right.1.cmp(&left.1));
        let Some((value, count)) = counts.first().copied() else {
            return Ok(None);
        };
        let runner_up = counts.get(1).map(|entry| entry.1).unwrap_or(0);
        let is_stable = count >= 3
            && count.saturating_mul(100) >= sample_count.saturating_mul(55)
            && count > runner_up;
        Ok(is_stable.then(|| value.to_owned()))
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

fn is_emoji_like(character: char) -> bool {
    matches!(
        character as u32,
        0x1F300..=0x1FAFF | 0x2600..=0x26FF | 0x2700..=0x27BF
    )
}

fn angle_label(value: &str) -> &'static str {
    match value {
        "direct" => "Often chooses direct replies",
        "practical" => "Often chooses practical replies",
        "playful" => "Often chooses playful replies",
        "counterpoint" => "Often chooses counterpoints",
        "question-led" => "Often chooses question-led replies",
        _ => "Often chooses analogies",
    }
}

fn length_label(value: &str) -> &'static str {
    match value {
        "brief" => "Often chooses brief replies",
        "compact" => "Often chooses compact replies",
        _ => "Often chooses developed replies",
    }
}

fn shape_label(value: &str) -> &'static str {
    if value == "question" {
        "Often ends replies with a question"
    } else {
        "Often chooses statement replies"
    }
}

fn casing_label(value: &str) -> &'static str {
    if value == "lowercase" {
        "Often uses casual lowercase openings"
    } else {
        "Often uses standard capitalization"
    }
}

fn emoji_label(value: &str) -> &'static str {
    if value == "emoji" {
        "Often chooses replies with emoji"
    } else {
        "Often chooses replies without emoji"
    }
}

fn punctuation_label(value: &str) -> &'static str {
    if value == "expressive" {
        "Often chooses expressive punctuation"
    } else {
        "Often chooses calm punctuation"
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, process, time::SystemTime};

    use super::Store;

    #[test]
    fn audit_error_upgrade_preserves_existing_data_and_reopens_cleanly() {
        let path = std::env::temp_dir().join(format!("pop-audit-{}.sqlite3", uuid::Uuid::new_v4()));
        let legacy = rusqlite::Connection::open(&path).unwrap();
        legacy.execute_batch(
            "CREATE TABLE ai_request_audit (
                id TEXT PRIMARY KEY, task TEXT, provider TEXT, model TEXT,
                input_chars INTEGER, output_chars INTEGER, succeeded INTEGER, created_at INTEGER
             );
             INSERT INTO ai_request_audit VALUES ('old', 'DRAFT_REPLY', 'groq', 'model', 1, 2, 1, 1);"
        ).unwrap();
        drop(legacy);
        let store = Store::open(&path).unwrap();
        store
            .set_text("reply_voice_profile", "saved-profile", 1)
            .unwrap();
        store
            .audit_ai_request(
                "new",
                "DRAFT_REPLY",
                "groq",
                "model",
                8,
                0,
                false,
                2,
                Some("GROQ_RATE_LIMITED:60"),
            )
            .unwrap();
        drop(store);
        let store = Store::open(&path).unwrap();
        assert_eq!(
            store
                .text_setting("reply_voice_profile")
                .unwrap()
                .as_deref(),
            Some("saved-profile")
        );
        let records: Vec<(String, Option<String>)> = store
            .connection
            .prepare("SELECT id, error_code FROM ai_request_audit ORDER BY created_at")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            records,
            vec![
                ("old".to_owned(), None),
                ("new".to_owned(), Some("GROQ_RATE_LIMITED:60".to_owned()))
            ]
        );
        drop(store);
        let _ = fs::remove_file(path);
    }

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

    #[test]
    fn reply_learning_requires_repeated_explicit_choices_and_deduplicates_requests() {
        let nonce = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "pop-reply-learning-{}-{nonce}.sqlite3",
            process::id()
        ));
        let store = Store::open(&path).expect("store should open");

        for index in 0..4 {
            let inserted = store
                .record_response_choice(
                    &format!("request-{index}"),
                    "DRAFT_REPLY",
                    "CONVERSATION",
                    0,
                    "yeah, that makes sense",
                    "DRAG",
                    100 + index,
                )
                .expect("choice should be recorded");
            assert!(inserted);
        }
        assert!(
            !store
                .record_response_choice(
                    "request-0",
                    "DRAFT_REPLY",
                    "CONVERSATION",
                    0,
                    "different raw wording must not count twice",
                    "COPY",
                    200,
                )
                .expect("duplicate choice should be ignored")
        );

        let profile = store
            .reply_learning_profile("DRAFT_REPLY", "CONVERSATION")
            .expect("profile should load");
        assert_eq!(profile.sample_count, 4);
        assert_eq!(profile.angle.as_deref(), Some("direct"));
        assert_eq!(profile.length.as_deref(), Some("brief"));
        assert_eq!(profile.shape.as_deref(), Some("statement"));
        assert_eq!(profile.casing.as_deref(), Some("lowercase"));
        assert_eq!(profile.emoji.as_deref(), Some("no-emoji"));

        let stored_choice_columns: Vec<String> = store
            .connection
            .prepare("PRAGMA table_info(accepted_response_choices)")
            .expect("schema should be readable")
            .query_map([], |row| row.get(1))
            .expect("columns should load")
            .collect::<Result<_, _>>()
            .expect("columns should collect");
        assert!(
            !stored_choice_columns
                .iter()
                .any(|column| column == "output")
        );

        drop(store);
        let _ = fs::remove_file(path);
    }
}
