use std::time::Instant;

use harper_core::{
    Dialect, Document,
    linting::{LintGroup, Linter, Suggestion},
    parsers::PlainEnglish,
    spell::FstDictionary,
};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingIssue {
    pub start: usize,
    pub end: usize,
    pub message: String,
    pub replacement: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingAnalysis {
    pub original: String,
    pub corrected: String,
    pub issues: Vec<WritingIssue>,
    pub elapsed_ms: u128,
    pub engine: &'static str,
}

pub fn analyze(text: &str) -> WritingAnalysis {
    let started = Instant::now();
    let document = Document::new_curated(text, &PlainEnglish);
    let mut linter = LintGroup::new_curated(FstDictionary::curated(), Dialect::American);
    let mut lints = linter.lint(&document);
    harper_core::remove_overlaps(&mut lints);
    lints.sort_by_key(|lint| lint.span.start);

    let issues = lints
        .iter()
        .take(20)
        .map(|lint| WritingIssue {
            start: lint.span.start,
            end: lint.span.end,
            message: lint.message.clone(),
            replacement: lint
                .suggestions
                .first()
                .and_then(|suggestion| match suggestion {
                    Suggestion::ReplaceWith(chars) | Suggestion::InsertAfter(chars) => {
                        Some(chars.iter().collect())
                    }
                    Suggestion::Remove => Some(String::new()),
                }),
        })
        .collect();

    let mut corrected: Vec<char> = text.chars().collect();
    for lint in lints.iter().rev() {
        if let Some(suggestion) = lint.suggestions.first() {
            suggestion.apply(lint.span, &mut corrected);
        }
    }

    WritingAnalysis {
        original: text.to_owned(),
        corrected: corrected.into_iter().collect(),
        issues,
        elapsed_ms: started.elapsed().as_millis(),
        engine: "harper",
    }
}

pub fn warm_up() {
    let _ = analyze("POP is ready.");
}

#[cfg(test)]
mod tests {
    use super::analyze;

    #[test]
    fn corrects_common_english_error_locally() {
        let result = analyze("This is an test.");
        assert_eq!(result.corrected, "This is a test.");
        assert!(!result.issues.is_empty());
    }
}
