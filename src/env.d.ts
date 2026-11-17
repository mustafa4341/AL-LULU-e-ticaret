/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    katalog: import('./lib/katalog').Katalog;
    yonetici: boolean;
    musteriGorunumu: boolean;
  }
}
