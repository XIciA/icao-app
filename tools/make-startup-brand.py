from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
root=Path.cwd(); s=3
canvas=Image.new('RGBA',(320*s,320*s),(0,0,0,0))
logo=Image.open(root/'assets/images/icon-native.png').convert('RGBA').resize((160*s,160*s),Image.Resampling.LANCZOS)
mask=Image.new('L',logo.size,0); ImageDraw.Draw(mask).rounded_rectangle((0,0,160*s-1,160*s-1),radius=35.2*s,fill=255)
canvas.paste(logo,(80*s,30*s),mask)
d=ImageDraw.Draw(canvas); font=ImageFont.truetype(str(root/'assets/fonts/NotoSerifSC_600SemiBold.ttf'),24*s)
d.text((160*s,207*s),'听你五个',font=font,fill='#11161F',anchor='mt')
f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',9*s)
label='READ YOU 5'; widths=[d.textlength(c,font=f) for c in label]; x=(320*s-sum(widths)-3*s*(len(label)-1))/2
for c,w in zip(label,widths): d.text((x,259*s),c,font=f,fill='#1F5ED9',anchor='lt'); x+=w+3*s
canvas.save(root/'assets/images/startup-brand.png')
