import sys
import re

content = open('src/components/SettingsView.tsx', 'r', encoding='utf-8').read()

# 1. Add import
content = content.replace("import { t } from '../lib/portalI18n';", "import { t } from '../lib/portalI18n';\nimport AccessControlView from './AccessControlView';")

# 2. Add state
content = content.replace("const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);", "const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);\n  const [activeTab, setActiveTab] = useState<'profile' | 'access'>('profile');")

# 3. Add tabs before the main grid
tabs_code = '''
  const roleName = profile?.role_name || profile?.roles?.role_name || profile?.role || 'Unknown';
  const isITAdmin = true; // Temporarily allow access to debug

  return (
    <div className="space-y-6">
      {isITAdmin && (
        <div className="flex bg-slate-100/50 dark:bg-zinc-900/40 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 w-full sm:w-fit mx-auto mt-4 md:mt-0">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all min-h-[44px] ${
              activeTab === 'profile' 
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {t('settings', 'editProfile', lang)}
          </button>
          <button
            onClick={() => setActiveTab('access')}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all min-h-[44px] ${
              activeTab === 'access' 
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Access Control (Admin)
          </button>
        </div>
      )}

      {activeTab === 'access' && isITAdmin ? (
        <AccessControlView />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-page-transition pt-4 md:pt-0">
'''

content = content.replace('  return (\n    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-page-transition pt-12 md:pt-0">', tabs_code)

# 4. Display the role name
content = content.replace(
    "{t('settings', 'userLabel', lang)}</p>",
    "{t('settings', 'userLabel', lang)} • {roleName}</p>"
)

# 5. Close the wrapper at the very end
end_code = '''        </div>
      </div>
    </div>
      )}
    </div>
  );
}'''
content = re.sub(r'        </div>\n      </div>\n    </div>\n  \);\n}', end_code, content)

open('src/components/SettingsView.tsx', 'w', encoding='utf-8').write(content)
print('Settings patched fully')
