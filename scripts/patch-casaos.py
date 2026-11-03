import os
import sys

# Script utilitário para atualizar/customizar parâmetros de proxy/subcaminho no CasaOS quando desejado.
# Permite definir hostname, scheme, index e port_map via variáveis de ambiente com fallback anônimo.
target_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/current-kraken.yml'
output_file = sys.argv[2] if len(sys.argv) > 2 else '/tmp/updated-kraken.yml'

custom_hostname = os.getenv('KRAKEN_HOSTNAME', '')
custom_scheme = os.getenv('KRAKEN_SCHEME', 'http')
custom_index = os.getenv('KRAKEN_INDEX', '/')
custom_port_map = os.getenv('KRAKEN_PORT_MAP', '8088')

if not os.path.exists(target_file):
    print(f'File {target_file} not found', file=sys.stderr)
    sys.exit(1)

with open(target_file, 'r') as f:
    text = f.read()

# Aplica substituições conforme configurações fornecidas
if custom_index != '/':
    text = text.replace('index: /', f'index: {custom_index}')

if custom_port_map != '8088':
    text = text.replace('port_map: "8088"', f'port_map: "{custom_port_map}"')

if custom_hostname:
    text = text.replace('scheme: http', f'scheme: {custom_scheme}\n    hostname: {custom_hostname}')
elif custom_scheme != 'http':
    text = text.replace('scheme: http', f'scheme: {custom_scheme}')

with open(output_file, 'w') as f:
    f.write(text)

print('Success')
