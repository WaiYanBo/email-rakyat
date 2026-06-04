import os
import glob

components_dir = 'src'
files = glob.glob(os.path.join(components_dir, '**', '*.tsx'), recursive=True)
files.extend(glob.glob(os.path.join(components_dir, '**', '*.astro'), recursive=True))

replacements = {
    # Backgrounds
    'dark:bg-zinc-950': 'dark:bg-black',
    'dark:bg-zinc-900': 'dark:bg-gray-900',
    'dark:bg-zinc-800': 'dark:bg-gray-800',
    'dark:bg-zinc-850': 'dark:bg-gray-850',
    
    # Borders & Dividers
    'dark:border-zinc-800': 'dark:border-gray-800',
    'dark:border-zinc-900': 'dark:border-gray-900',
    'dark:border-zinc-700': 'dark:border-gray-700',
    'dark:divide-zinc-850': 'dark:divide-gray-800',
    'dark:divide-zinc-800': 'dark:divide-gray-800',
    
    # Text colors
    'dark:text-indigo-400': 'dark:text-yellow-500',
    'dark:text-cyan-400': 'dark:text-yellow-500',
    'dark:text-purple-400': 'dark:text-yellow-500',
    'dark:text-amber-400': 'dark:text-yellow-500',
    
    # Badges / Light Backgrounds
    'dark:bg-indigo-950/20': 'dark:bg-yellow-500/10',
    'dark:bg-cyan-950/20': 'dark:bg-yellow-500/10',
    'dark:bg-purple-950/20': 'dark:bg-yellow-500/10',
    'dark:border-indigo-500/30': 'dark:border-yellow-500/30',
    'dark:border-cyan-500/30': 'dark:border-yellow-500/30',
    'dark:border-purple-500/30': 'dark:border-yellow-500/30',
    
    # Buttons / Primary interactive
    'dark:bg-indigo-600': 'dark:bg-yellow-500 dark:text-black font-semibold border-0',
    'dark:bg-cyan-600': 'dark:bg-yellow-500 dark:text-black font-semibold border-0',
    'dark:bg-purple-600': 'dark:bg-yellow-500 dark:text-black font-semibold border-0',
    
    'dark:hover:bg-indigo-500': 'dark:hover:bg-yellow-400',
    'dark:hover:bg-cyan-500': 'dark:hover:bg-yellow-400',
    'dark:hover:bg-purple-500': 'dark:hover:bg-yellow-400',
    
    # Active Borders
    'dark:border-indigo-500': 'dark:border-yellow-500',
    'dark:border-cyan-500': 'dark:border-yellow-500',
    'dark:border-purple-500': 'dark:border-yellow-500',
    
    # Text Hover
    'dark:hover:text-indigo-400': 'dark:hover:text-yellow-400',
    'dark:hover:text-cyan-400': 'dark:hover:text-yellow-400',
    
    # Focus
    'dark:focus:border-indigo-500': 'dark:focus:border-yellow-500',
    'dark:focus:ring-indigo-500': 'dark:focus:ring-yellow-500',
}

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    for old_val, new_val in replacements.items():
        content = content.replace(old_val, new_val)
        
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")
