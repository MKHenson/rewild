export class ViewProperties {
  enabled: boolean;
  fullWidth: f32;
  fullHeight: f32;
  offsetX: f32;
  offsetY: f32;
  width: f32;
  height: f32;

  constructor(source: ViewProperties | null) {
    this.enabled = source ? source.enabled : true;
    this.fullWidth = source ? source.fullWidth : 1;
    this.fullHeight = source ? source.fullHeight : 1;
    this.offsetX = source ? source.offsetX : 0;
    this.offsetY = source ? source.offsetY : 0;
    this.width = source ? source.width : 1;
    this.height = source ? source.height : 1;
  }
}
