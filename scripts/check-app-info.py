import json, urllib.request
data = json.loads(urllib.request.urlopen('http://127.0.0.1:80/v2/app_management/compose').read())
app = data.get('data', {}).get('krakenbridge-web')
if app:
    print('x-casaos:', json.dumps(app.get('compose', {}).get('x-casaos'), indent=2))
    print('store_info:', json.dumps(app.get('store_info'), indent=2))
else:
    print('krakenbridge-web not in list')
