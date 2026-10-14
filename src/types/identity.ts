export interface KrakenIdentity {
  name: string;
  fullName: string;
  aliases: string[];
  paths: {
    selfSource: string;
    userWorkspaces: string;
    [key: string]: string;
  };
  homelab?: {
    dockerEnabled?: boolean;
    storagePath?: string;
    appsConfigPath?: string;
  };
  [key: string]: unknown;
}

export interface SystemDirectiveOptions {
  conversationId?: string;
  activeChatMode?: string;
  subproject?: string;
  tags?: string[];
}
