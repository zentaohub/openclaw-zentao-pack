declare module "xmind-generator" {
  export function Topic(title: string): any;
  export function RootTopic(title: string): any;
  export function Workbook(rootTopic: any): any;
  export function writeLocalFile(workbook: any, outputFile: string): Promise<void>;
}
