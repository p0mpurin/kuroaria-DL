use std::path::{Path, PathBuf};

/// Subfolders created under the download directory when sorting is enabled.
pub const SORT_SUBDIRS: &[&str] = &[
    "Images",
    "Videos",
    "Audio",
    "Archives",
    "Documents",
    "Programs",
];

pub fn category_subdir(filename: &str) -> Option<&'static str> {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())?;

    let category = match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" | "ico" | "avif" | "heic"
        | "heif" | "tif" | "tiff" => "Images",
        "mp4" | "mkv" | "avi" | "mov" | "webm" | "flv" | "wmv" | "m4v" | "mpg" | "mpeg"
        | "3gp" => "Videos",
        "mp3" | "flac" | "wav" | "ogg" | "aac" | "m4a" | "opus" | "wma" | "aiff" => "Audio",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "lz4" | "zst" | "tgz" | "tbz2"
        | "7zip" => "Archives",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "rtf"
        | "odt" | "ods" | "odp" | "epub" | "csv" => "Documents",
        "exe" | "msi" | "dmg" | "apk" | "deb" | "rpm" | "appimage" | "msix" => "Programs",
        _ => return None,
    };

    Some(category)
}

/// Resolves the aria2 `dir` for a download (base dir or `base/Category`).
pub fn resolve_download_dir(base_dir: &str, filename: &str, sort_enabled: bool) -> PathBuf {
    let base = PathBuf::from(base_dir);
    if !sort_enabled {
        return base;
    }
    let Some(sub) = category_subdir(filename) else {
        return base;
    };
    let target = base.join(sub);
    std::fs::create_dir_all(&target).ok();
    target
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_common_extensions() {
        assert_eq!(category_subdir("photo.JPG"), Some("Images"));
        assert_eq!(category_subdir("game.zip"), Some("Archives"));
        assert_eq!(category_subdir("readme"), None);
    }
}
