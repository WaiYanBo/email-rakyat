import os
from supabase import create_client
import re

with open('.env', 'r') as f:
    env = f.read()

url = re.search(r'PUBLIC_SUPABASE_URL="([^"]+)"', env).group(1)
key = re.search(r'PUBLIC_SUPABASE_ANON_KEY="([^"]+)"', env).group(1)

supabase = create_client(url, key)
response = supabase.table('profiles').select('full_name, role_id, roles(role_name)').limit(5).execute()
print(response.data)
