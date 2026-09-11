<?php
declare(strict_types=1);
require_once __DIR__ . '/api/config.php';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: public, max-age=3600');
echo "User-agent: *\n";
echo "Allow: /\n";
echo "Disallow: /api/\n";
echo "Disallow: /checkout.html\n";
echo "Disallow: /cuenta.html\n";
echo "Disallow: /order.html\n";
echo "Disallow: /payment-\n";
if (str_starts_with(APP_BASE_URL, 'https://')) {
    echo 'Sitemap: ' . APP_BASE_URL . "/sitemap.xml\n";
}
