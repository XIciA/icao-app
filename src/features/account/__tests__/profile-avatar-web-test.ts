import { prepareProfileAvatar } from '../../../../modules/icao-profile-avatar/src/index.web';

it('limits a selected browser image to a small opaque JPEG with the same payload limit', async () => {
  const context = {fillStyle:'',fillRect:jest.fn(),drawImage:jest.fn()};
  const canvas = {width:0,height:0,getContext:()=>context,toDataURL:jest.fn(()=> 'data:image/jpeg;base64,/9j/AA==')};
  const originalImage = globalThis.Image, originalDocument = globalThis.document;
  class SelectedImage {
    naturalWidth=1000; naturalHeight=500; onload?:()=>void;
    set src(value:string) {if (value) this.onload?.();}
  }
  Object.defineProperty(globalThis,'Image',{configurable:true,value:SelectedImage});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas}});
  try {
    await expect(prepareProfileAvatar('blob:local-image')).resolves.toBe('data:image/jpeg;base64,/9j/AA==');
    expect(context.fillRect).toHaveBeenCalledWith(0,0,256,128);
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(SelectedImage),0,0,256,128);
    expect(context.fillStyle).toBe('#ffffff');
    expect(canvas.width).toBe(0);
    await expect(prepareProfileAvatar('https://example.com/image')).rejects.toThrow('local image');
  } finally {
    Object.defineProperty(globalThis,'Image',{configurable:true,value:originalImage});
    Object.defineProperty(globalThis,'document',{configurable:true,value:originalDocument});
  }
});
