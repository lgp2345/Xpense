import { Injectable } from "@nestjs/common";

import { parseServerEnv, type ServerEnv } from "./env.schema.js";

@Injectable()
export class ServerConfigService {
  readonly env: ServerEnv;

  constructor() {
    this.env = parseServerEnv(process.env);
  }
}
