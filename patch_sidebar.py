import sys
import re

content = open('src/components/PortalSidebar.tsx', 'r').read()

# Add import
content = content.replace("import { t } from '../lib/portalI18n';", "import { t } from '../lib/portalI18n';\nimport { usePermissions } from '../hooks/usePermissions';")

# Add hook usage inside component
content = re.sub(r'const \{ lang \} = usePortalLanguage\(\);', r'const { lang } = usePortalLanguage();\n  const { permissions } = usePermissions(profile);', content)

# Replace getNavItems logic
new_logic = '''
    const canViewClients = permissions.view_clients;
    const canViewReports = permissions.view_staff;
    
    const items = [
'''

content = re.sub(r'''
    const hasFullAccess = \['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'\]\.includes\(profile\.role\);
    const hasViewAccess = \['Intern', 'Contract'\]\.includes\(profile\.role\);
    const canViewClients = hasFullAccess \|\| hasViewAccess;
    
    const items = \[''', new_logic, content, flags=re.VERBOSE | re.DOTALL)

# Replace if (hasFullAccess) for Reports
content = content.replace("if (hasFullAccess) {", "if (canViewReports) {")

open('src/components/PortalSidebar.tsx', 'w').write(content)
print("PortalSidebar patched")
