with open('/tmp/current-kraken.yml', 'r') as f:
    text = f.read()

text = text.replace('index: /', 'index: /chat/')
text = text.replace('port_map: "8088"', 'port_map: ""')
text = text.replace('scheme: http', 'scheme: https\n    hostname: gabisa.apenasgabs.dev')

with open('/tmp/updated-kraken.yml', 'w') as f:
    f.write(text)

print('Success')
