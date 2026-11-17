import type { APIRoute } from 'astro';
import { oturumKapat } from '../../lib/oturum';

export const POST: APIRoute = ({ cookies, redirect }) => {
  oturumKapat(cookies);
  return redirect('/yonetim/giris');
};
