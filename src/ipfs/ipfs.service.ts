/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private readonly pinataApiKey: string;
  private readonly pinataSecretKey: string;
  private readonly pinataGateway: string;

  constructor(private configService: ConfigService) {
    this.pinataApiKey = this.configService.get<string>('PINATA_API_KEY') || '';
    this.pinataSecretKey =
      this.configService.get<string>('PINATA_SECRET_KEY') || '';
    // Gateway padrão do Pinata
    this.pinataGateway = 'https://gateway.pinata.cloud/ipfs/';
  }

  async uploadFile(filePath: string): Promise<string> {
    if (!this.pinataApiKey || !this.pinataSecretKey) {
      throw new Error('Pinata API keys not configured');
    }

    const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const response = await axios.post(url, formData, {
      headers: {
        pinata_api_key: this.pinataApiKey,
        pinata_secret_api_key: this.pinataSecretKey,
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const ipfsHash = response.data.IpfsHash;
    this.logger.log(`✅ Arquivo enviado para IPFS. Hash: ${ipfsHash}`);
    this.logger.log(`🔗 URL: ${this.getPublicUrl(ipfsHash)}`);

    return ipfsHash;
  }

  getPublicUrl(ipfsHash: string): string {
    if (!ipfsHash) return '';
    return `${this.pinataGateway}${ipfsHash}`;
  }
}
