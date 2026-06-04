import sys
import re

content = open('src/components/ExecutiveOverview.tsx', 'r', encoding='utf-8').read()

# Add import
content = content.replace("import { t } from '../lib/portalI18n';", "import { t } from '../lib/portalI18n';\nimport { usePermissions } from '../hooks/usePermissions';")

# Add hook usage inside component
content = re.sub(r'const \{ lang \} = usePortalLanguage\(\);', r'const { lang } = usePortalLanguage();\n  const { permissions, loading: permsLoading } = usePermissions(profile);', content)

new_logic = '''
  const hasFullAccess = permissions.view_snapshot;
  const isIT = profile?.role_name === 'IT Admin' || profile?.roles?.role_name === 'IT Admin';
'''

content = re.sub(r'''
  const hasFullAccess = \['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin', 'Department Head', 'Manager'\]
    \.includes\(profile\?\.role_name \|\| profile\?\.roles\?\.role_name\);
  const isIT = profile\?\.role_name === 'IT Admin' \|\| profile\?\.roles\?\.role_name === 'IT Admin';''', new_logic, content, flags=re.VERBOSE | re.DOTALL)

open('src/components/ExecutiveOverview.tsx', 'w', encoding='utf-8').write(content)
print("ExecutiveOverview patched")
