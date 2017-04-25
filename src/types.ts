import { Stream } from 'xstream';

export type WorkerConnector = (rx: MessagePort, tx: MessagePort) => (sink: Stream<any>) => any;
export type MainConnector = (rx: MessagePort, tx: MessagePort) => (source: any) => Stream<any>;
export type WorkerConnectors = {
  [key: string]: WorkerConnector
}
export type MainConnectors = {
  [key: string]: MainConnector
};