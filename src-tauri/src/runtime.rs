use std::sync::atomic::{AtomicBool, Ordering};

/// Live preference for close-to-tray (updated when settings save).
pub struct RuntimePrefs {
    pub minimize_to_tray: AtomicBool,
}

impl RuntimePrefs {
    pub fn new(minimize_to_tray: bool) -> Self {
        Self {
            minimize_to_tray: AtomicBool::new(minimize_to_tray),
        }
    }

    pub fn set_minimize_to_tray(&self, value: bool) {
        self.minimize_to_tray.store(value, Ordering::Relaxed);
    }

    pub fn should_minimize_to_tray(&self) -> bool {
        self.minimize_to_tray.load(Ordering::Relaxed)
    }
}
