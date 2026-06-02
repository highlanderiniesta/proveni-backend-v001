// src/test-routes.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const server = app.getHttpServer();
  await app.init();

  const router = server._events.request._router;
  console.log('\n📋 ROTAS REGISTRADAS:');
  router.stack.forEach((layer: any) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      console.log(`${methods} ${layer.route.path}`);
    }
  });

  await app.close();
}
bootstrap();
