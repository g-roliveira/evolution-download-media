require('dotenv').config();
const express = require('express');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const cors = require('cors');
const { S3Client, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const { body, validationResult } = require('express-validator');
const mime = require('mime-types');
const logger = require('pino')({
  level: process.env.LOG_LEVEL || 'info'
});

// Validação inicial de variáveis de ambiente
const requiredEnvVars = [
  'AWS_REGION', 
  'S3_BUCKET', 
  'AWS_ACCESS_KEY_ID', 
  'AWS_SECRET_ACCESS_KEY',
  'CORS_ORIGINS'
];

requiredEnvVars.forEach(env => {
  if (!process.env[env]) {
    logger.error(`Variável de ambiente ${env} não definida`);
    process.exit(1);
  }
});

// Configuração do S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  forcePathStyle: Boolean(process.env.S3_ENDPOINT)
});

const app = express();

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGINS.split(','),
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

// Sanitização de caminhos S3
const sanitizeS3Path = (...parts) => 
  parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/[^a-zA-Z0-9\-_./]/g, '')
    .replace(/\.\./g, '');

// Função para criar o bucket se não existir
async function createBucket() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
    logger.info(`Bucket ${process.env.S3_BUCKET} já existe`);
  } catch (error) {
    if (error.name === 'NotFound') {
      await s3Client.send(new CreateBucketCommand({ 
        Bucket: process.env.S3_BUCKET,
        ObjectOwnership: 'ObjectWriter'
      }));
      logger.info(`Bucket ${process.env.S3_BUCKET} criado com sucesso`);
    } else {
      logger.error(error, 'Erro ao verificar/criar bucket');
      throw error;
    }
  }
}

// Função de upload para S3 com streaming
async function uploadToS3(stream, metadata) {
  const { instanceId, remoteJid, mediaType, mimetype, folderName } = metadata;
  
  const fileName = `${Date.now()}.${mime.extension(mimetype) || 'bin'}`;
  const objectName = sanitizeS3Path(
    folderName,
    instanceId,
    remoteJid,
    mediaType,
    fileName
  );

  const parallelUpload = new Upload({
    client: s3Client,
    params: {
      Bucket: process.env.S3_BUCKET,
      Key: objectName,
      Body: stream,
      ContentType: mimetype,
      Metadata: {
        'instance-id': instanceId,
        'remote-jid': remoteJid,
        'media-type': mediaType
      }
    }
  });

  await parallelUpload.done();

  const getCommand = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: objectName
  });

  const signedUrlExpire = parseInt(process.env.SIGNED_URL_EXPIRE || '3600', 10);
  return {
    url: await getSignedUrl(s3Client, getCommand, { expiresIn: signedUrlExpire }),
    fileName: objectName
  };
}

// Endpoint com validação
app.post('/v1/download-media', 
  [
    body('url').isURL().withMessage('URL inválida'),
    body('mediaKey').isBase64().withMessage('mediaKey deve ser base64'),
    body('mimetype').isMimeType().withMessage('Mimetype inválido'),
    body('remoteJid').isString().notEmpty().withMessage('remoteJid obrigatório'),
    body('mediaType').isString().notEmpty().withMessage('mediaType obrigatório'),
    body('instanceId').isString().notEmpty().withMessage('instanceId obrigatório'),
    body('folderName').optional().isString().matches(/^[a-zA-Z0-9\-_]+$/).withMessage('folderName deve conter apenas letras, números, hífen e underscore')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { url, mediaKey, mimetype, remoteJid, mediaType, instanceId, folderName = 'whatsapp-media' } = req.body;

      // Validação adicional de parâmetros
      const paramRegex = /^[a-zA-Z0-9\-_@.]+$/;
      if (![instanceId, remoteJid, mediaType].every(p => paramRegex.test(p))) {
        return res.status(400).json({ error: 'Parâmetros contêm caracteres inválidos' });
      }

      const mediaKeyBuffer = Buffer.from(mediaKey.trim(), 'base64');
      const urlObj = new URL(url);
      
      const mediaMessage = {
        directPath: urlObj.pathname + urlObj.search,
        mediaKey: mediaKeyBuffer,
        url,
        mimetype,
        mediaKeyInfo: {
          iv: Buffer.alloc(16),
          encIv: mediaKeyBuffer.subarray(0, 16),
          key: mediaKeyBuffer,
          macKey: mediaKeyBuffer.subarray(16)
        }
      };

      const message = {
        key: {
          id: Date.now().toString(),
          remoteJid
        },
        message: {
          [mediaType]: mediaMessage
        }
      };

      const stream = await downloadMediaMessage(
        message,
        'stream',
        { logger }
      );

      const { url: s3Url, fileName } = await uploadToS3(stream, {
        instanceId,
        remoteJid,
        mediaType,
        mimetype,
        folderName
      });

      res.json({
        success: true,
        url: s3Url,
        fileName,
        expiresIn: process.env.SIGNED_URL_EXPIRE || 3600
      });

    } catch (error) {
      next(error);
    }
  }
);

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Erro interno no servidor'
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Inicialização
createBucket()
  .then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      logger.info(`API rodando na porta ${PORT}`);
      logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`CORS permitido para: ${process.env.CORS_ORIGINS}`);
    });
  })
  .catch(error => {
    logger.error(error, 'Falha na inicialização');
    process.exit(1);
  });
