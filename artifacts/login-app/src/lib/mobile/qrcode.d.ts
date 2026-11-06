declare module "qrcode" {
  namespace QRCode {
    function toDataURL(text: string, options?: { margin?: number; width?: number }): Promise<string>;
  }
  export default QRCode;
}
