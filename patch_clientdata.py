import sys
import re

content = open('src/components/ClientDataView.tsx', 'r', encoding='utf-8').read()

# Add import
content = content.replace("import { t } from '../lib/portalI18n';", "import { t } from '../lib/portalI18n';\nimport { usePermissions } from '../hooks/usePermissions';")

# Add hook usage inside component
content = re.sub(r'const \{ lang \} = usePortalLanguage\(\);', r'const { lang } = usePortalLanguage();\n  const { permissions, loading: permsLoading } = usePermissions(profile);', content)

new_logic = '''
        const hasFullAccess = permissions.edit_clients;
        const hasViewAccess = permissions.view_clients;
'''

content = re.sub(r'''
        const hasFullAccess = \['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'\].includes\(roleName\);
        const hasViewAccess = \['Intern', 'Contract'\].includes\(roleName\);''', new_logic, content, flags=re.VERBOSE | re.DOTALL)

open('src/components/ClientDataView.tsx', 'w', encoding='utf-8').write(content)
print("ClientDataView patched")
