with open('/var/lib/casaos/apps/krakenbridge-web/docker-compose.yml', 'r') as f:
    text = f.read()

text = text.replace('port_map: "8088"', 'port_map: ""')

with open('/var/lib/casaos/apps/krakenbridge-web/docker-compose.yml', 'w') as f:
    f.write(text)

print('Updated docker-compose.yml successfully')
