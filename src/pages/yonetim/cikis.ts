import type { APIRoute } from 'astro';
import { girisYolu, oturumKapat } from '../../lib/oturum';

export const POST: APIRoute = ({ cookies, redirect }) => {
  oturumKapat(cookies);
  // Gizli giriş adresi tanımlıysa çıkışta mağazaya dönülür (giriş adresi yer imlerinizde kalmalı)
  return redirect(girisYolu() ? '/' : '/yonetim/giris', 303);
};
