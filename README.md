# Evolution Download Media API

API para download e armazenamento de mídia do WhatsApp no S3, desenvolvida para integração com o Evolution API.

## 📝 Contexto e Propósito

Embora a Evolution API já possua funcionalidade nativa para download e upload de mídias para o S3, existe uma limitação significativa ao lidar com arquivos grandes. O problema ocorre porque a Evolution API converte as mídias para base64 durante o processo de buffer antes do upload, e devido às limitações do Node.js/Buffer, não é possível processar strings maiores que 512MB.

Esta API foi desenvolvida especificamente para resolver esse problema, implementando uma abordagem diferente:
- Faz o download da mídia descriptografada diretamente do WhatsApp
- Realiza o streaming direto para o S3, sem conversão para base64
- Evita o limite de memória do Node.js
- Permite o upload de arquivos de qualquer tamanho

Isso torna possível o processamento de mídias grandes que antes falhavam no fluxo nativo da Evolution API.

## 🚀 Funcionalidades

- Download de mídia do WhatsApp
- Upload automático para S3
- Geração de URLs assinadas para acesso temporário
- Suporte a diferentes tipos de mídia
- Validação de entrada robusta
- Logging estruturado

## 📋 Pré-requisitos

- Node.js 16+
- Docker e Docker Compose (para ambiente containerizado)
- Acesso ao AWS S3 ou compatível (ex: LocalStack para desenvolvimento)

## 🔧 Configuração

1. Clone o repositório
2. Copie o arquivo de exemplo de ambiente:
   ```bash
   cp .env.example .env
   ```
3. Configure as variáveis de ambiente no arquivo `.env`

### Variáveis de Ambiente

- `AWS_REGION`: Região AWS (ex: us-east-1)
- `AWS_ACCESS_KEY_ID`: Access Key ID da AWS
- `AWS_SECRET_ACCESS_KEY`: Secret Access Key da AWS
- `S3_BUCKET`: Nome do bucket S3
- `S3_ENDPOINT`: (Opcional) Endpoint S3 alternativo (para LocalStack)
- `CORS_ORIGINS`: Origins permitidos (separados por vírgula)
- `LOG_LEVEL`: Nível de log (default: info)
- `SIGNED_URL_EXPIRE`: Tempo de expiração das URLs assinadas em segundos

## 🚀 Instalação

### Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento
npm run dev
```

### Docker Compose

```bash
# Construir e iniciar os containers
docker-compose up -d

# Visualizar logs
docker-compose logs -f
```

### Docker Swarm

```bash
# Inicializar o Swarm (se ainda não inicializado)
docker swarm init

# Deploy do stack
docker stack deploy -c docker-compose-swarm.yml evolution-media

# Verificar status
docker service ls
```

## 📡 Endpoints

### POST /v1/download-media

Download e armazenamento de mídia do WhatsApp.

**Payload:**
```json
{
  "url": "https://mmg.whatsapp.net/...",
  "mediaKey": "base64_encoded_key",
  "mimetype": "image/jpeg",
  "remoteJid": "123456789@g.us",
  "mediaType": "imageMessage",
  "instanceId": "instance123"
}
```

**Resposta:**
```json
{
  "success": true,
  "url": "https://s3.../media.jpg",
  "fileName": "evolution-api/instance123/...",
  "expiresIn": 3600
}
```

## 🔒 Segurança

- Validação de entrada com express-validator
- Sanitização de caminhos S3
- CORS configurável
- URLs assinadas com tempo de expiração

## 📦 Estrutura do Projeto

```
.
├── WAPI.js              # Arquivo principal da API
├── package.json         # Dependências e scripts
├── .env.example         # Exemplo de configuração
├── Dockerfile          # Configuração Docker
├── docker-compose.yml  # Configuração Docker Compose
└── docker-compose-swarm.yml # Configuração Docker Swarm
```

## 🛠️ Desenvolvimento

### Ambiente Local com LocalStack

O docker-compose inclui LocalStack para simular o S3 localmente. Para usar:

1. Inicie o ambiente:
   ```bash
   docker-compose up -d localstack
   ```

2. Configure as variáveis de ambiente:
   ```
   AWS_ACCESS_KEY_ID=test
   AWS_SECRET_ACCESS_KEY=test
   S3_ENDPOINT=http://localhost:4566
   ```

## 📄 Licença

Este projeto está sob a licença MIT.
