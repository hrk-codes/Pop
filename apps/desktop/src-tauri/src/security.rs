use regex::Regex;

pub fn contains_likely_secret(text: &str) -> bool {
    let patterns = [
        r"(?i)\b(?:gsk|sk)-[a-z0-9_-]{16,}\b",
        r"(?i)\bgh[oprsu]_[a-z0-9]{20,}\b",
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        r"(?i)\b(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+",
    ];
    patterns
        .iter()
        .any(|pattern| Regex::new(pattern).is_ok_and(|regex| regex.is_match(text)))
}

#[cfg(test)]
mod tests {
    use super::contains_likely_secret;

    #[test]
    fn blocks_credentials_but_not_normal_writing() {
        assert!(contains_likely_secret("api_key=secret-value-123456789"));
        assert!(!contains_likely_secret("Please improve this short post."));
    }
}
