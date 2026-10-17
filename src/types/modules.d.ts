declare module 'qrcode';
declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }
  const webpush: any;
  export default webpush;
}
