import piexif from 'piexifjs';

const CLOUDINARY_CLOUD = (import.meta as any).env.VITE_CLOUDINARY_CLOUD || 'dz1n0g9yg';
const CLOUDINARY_PRESET = (import.meta as any).env.VITE_CLOUDINARY_PRESET || 'Fem_Apps';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

export function compressImage(
  file: File,
  maxWidth = 4800,
  maxHeight = 4800,
  quality = 0.88
): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;

      // STEP 1: Try to extract EXIF from original (only works on JPG)
      let exifObj: any = null;
      try {
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          exifObj = piexif.load(dataUrl);
          // Remove GPS block for privacy
          if (exifObj && exifObj['GPS']) {
            exifObj['GPS'] = {};
          }
        }
      } catch (err) {
        console.warn('EXIF read failed, continuing without metadata:', err);
        exifObj = null;
      }

      // STEP 2: Resize with canvas
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;

        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
        }

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            // STEP 3: Re-inject EXIF (if we had it)
            if (exifObj) {
              const compressedReader = new FileReader();
              compressedReader.onload = (ev) => {
                try {
                  const compressedDataUrl = ev.target?.result as string;
                  const exifStr = piexif.dump(exifObj);
                  const newDataUrl = piexif.insert(exifStr, compressedDataUrl);
                  
                  // Convert dataURL back to Blob -> File
                  const byteString = atob(newDataUrl.split(',')[1]);
                  const ab = new ArrayBuffer(byteString.length);
                  const ia = new Uint8Array(ab);
                  for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                  }
                  const finalBlob = new Blob([ab], { type: 'image/jpeg' });
                  resolve(new File([finalBlob], file.name, { type: 'image/jpeg' }));
                } catch (err) {
                  console.warn('EXIF inject failed, using image without metadata:', err);
                  resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }
              };
              compressedReader.onerror = () => {
                resolve(new File([blob], file.name, { type: 'image/jpeg' }));
              };
              compressedReader.readAsDataURL(blob);
            } else {
              // No EXIF available, return compressed image as-is
              resolve(new File([blob], file.name, { type: file.type }));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadToCloudinary(
  file: File,
  folderPath: string
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_PRESET);
  formData.append('folder', folderPath);

  const res = await fetch(CLOUDINARY_URL, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP error ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message);
  }

  if (!data.secure_url) {
    throw new Error('Unexpected response format from Cloudinary');
  }

  return data.secure_url;
}
