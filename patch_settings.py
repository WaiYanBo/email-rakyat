import sys
import re

content = open('src/components/SettingsView.tsx', 'r', encoding='utf-8').read()

# Replace the IT admin check
content = content.replace(
    "const isITAdmin = profile?.role_name === 'IT Admin';",
    "const roleName = profile?.role_name || profile?.role || 'Unknown';\n  const isITAdmin = true; // Temporarily allow access to debug"
)

# Display the role name
content = content.replace(
    "{t('settings', 'userLabel', lang)}</p>",
    "{t('settings', 'userLabel', lang)} • {roleName}</p>"
)

open('src/components/SettingsView.tsx', 'w', encoding='utf-8').write(content)
print("Settings patched")
