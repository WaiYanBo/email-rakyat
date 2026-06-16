const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
    fs.readdir(dir, function(err, list) {
        if (err) return callback(err);
        let pending = list.length;
        if (!pending) return callback(null);
        list.forEach(function(file) {
            file = path.resolve(dir, file);
            fs.stat(file, function(err, stat) {
                if (stat && stat.isDirectory()) {
                    walk(file, function(err) {
                        if (!--pending) callback(null);
                    });
                } else {
                    if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.astro')) {
                        cleanFile(file);
                    }
                    if (!--pending) callback(null);
                }
            });
        });
    });
}

function cleanFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 1. Remove JSX structural comments like {/* Header */}, {/* Modals */}
    // We only remove comments that look like pure labels (usually 1-4 words, capitalized, or separators like =====)
    // Be careful not to remove important explanatory comments.
    const jsxCommentRegex = /\{\/\*\s*([^}]+?)\s*\*\/\}/g;
    content = content.replace(jsxCommentRegex, (match, inner) => {
        // If it contains "DISABLED", "uncomment", or looks like real text, keep it.
        const isLabel = /^[\sA-Za-z0-9_=:-]+$/.test(inner) && inner.split(' ').length <= 6;
        if (isLabel && !inner.toLowerCase().includes('disabled') && !inner.toLowerCase().includes('uncomment')) {
            return ''; // Remove
        }
        return match; // Keep
    });

    // 2. Remove purely structural single line comments like // MODAL STATE
    // Only if they are very short and mostly uppercase or capitalized.
    const inlineCommentRegex = /^[ \t]*\/\/[ \t]+([A-Za-z0-9_=\-\s]+)[ \t]*\r?\n/gm;
    content = content.replace(inlineCommentRegex, (match, inner) => {
        const words = inner.trim().split(' ');
        const isLabel = words.length <= 6 && words.every(w => /^[A-Z0-9_\-\=]+$/.test(w) || /^[A-Z][a-z0-9]+/.test(w));
        if (isLabel && !inner.toLowerCase().includes('disabled') && !inner.toLowerCase().includes('uncomment')) {
            return ''; // Remove line
        }
        return match; // Keep line
    });

    // 3. Remove trailing whitespaces on lines
    content = content.replace(/[ \t]+\r?\n/g, '\n');
    
    // 4. Remove multiple consecutive empty lines (more than 2)
    content = content.replace(/\n{3,}/g, '\n\n');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Cleaned: ${filePath}`);
}

walk('src', function(err) {
    if (err) throw err;
    console.log('Cleanup complete!');
});
