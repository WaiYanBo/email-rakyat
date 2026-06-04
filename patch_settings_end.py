import sys
import re

content = open('src/components/SettingsView.tsx', 'r', encoding='utf-8').read()

end_code = '''        </div>
      </div>
      )}
    </div>
  );
}'''

content = re.sub(r'        </div>\n\n      </div>\n\n    </div>\n  \);\n}', end_code, content)

open('src/components/SettingsView.tsx', 'w', encoding='utf-8').write(content)
print('Settings end patched')
