import sys

content = open('src/components/SettingsView.tsx', 'r', encoding='utf-8').read()

import_stmt = "import { usePermissions } from '../hooks/usePermissions';\n"
if "usePermissions" not in content:
    content = content.replace("import AccessControlView from './AccessControlView';", "import AccessControlView from './AccessControlView';\n" + import_stmt)

# Inject usePermissions call
use_perm_call = "  const { permissions } = usePermissions(profile);\n"
if "usePermissions(profile)" not in content:
    content = content.replace("  const isITAdmin = roleName === 'IT Admin';", "  const isITAdmin = roleName === 'IT Admin';\n" + use_perm_call)

# Update logic
old_logic1 = "{isITAdmin && ("
new_logic1 = "{(isITAdmin || permissions?.manage_access_control) && ("
content = content.replace(old_logic1, new_logic1, 1)

old_logic2 = "{activeTab === 'access' && isITAdmin ? ("
new_logic2 = "{activeTab === 'access' && (isITAdmin || permissions?.manage_access_control) ? ("
content = content.replace(old_logic2, new_logic2)

old_logic3 = "<AccessControlView />"
new_logic3 = "<AccessControlView isITAdmin={isITAdmin} />"
content = content.replace(old_logic3, new_logic3)

open('src/components/SettingsView.tsx', 'w', encoding='utf-8').write(content)
print("SettingsView patched")
