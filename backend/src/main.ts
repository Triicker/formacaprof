import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadConfig } from './config/app-config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.forRoot(config), { bufferLogs: false });
  configureApp(app, config);
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API (${config.env}) ouvindo na porta ${config.port}`, 'Bootstrap');
}

bootstrap().catch((e: Error) => {
  // Falha de configuração deve derrubar o processo com mensagem clara (sem expor segredos).
  console.error(`Falha ao iniciar a API: ${e.message}`);
  process.exit(1);
});
