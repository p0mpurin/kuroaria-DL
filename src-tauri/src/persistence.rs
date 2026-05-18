use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::models::PersistedState;

pub struct Store {
    data_dir: PathBuf,
    path: PathBuf,
}

impl Store {
    pub fn new() -> Result<Self> {
        let dir = Self::data_dir_path();
        fs::create_dir_all(&dir).context("create data dir")?;
        Ok(Self {
            path: dir.join("state.json"),
            data_dir: dir,
        })
    }

    pub fn data_dir_path() -> PathBuf {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("KuroAria-DL")
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn load(&self) -> Result<Option<PersistedState>> {
        if !self.path.exists() {
            return Ok(None);
        }
        let raw = fs::read_to_string(&self.path).context("read state")?;
        let state: PersistedState = serde_json::from_str(&raw).context("parse state")?;
        Ok(Some(state))
    }

    pub fn save(&self, state: &PersistedState) -> Result<()> {
        let raw = serde_json::to_string_pretty(state).context("serialize state")?;
        fs::write(&self.path, raw).context("write state")?;
        Ok(())
    }
}
