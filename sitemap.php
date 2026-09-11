<?php
declare(strict_types=1);
require_once __DIR__ . '/api/config.php';

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
$base = htmlspecialchars(rtrim(APP_BASE_URL, '/'), ENT_XML1 | ENT_QUOTES, 'UTF-8');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach (['/index.html', '/catalogo.html'] as $path) {
    echo '  <url><loc>' . $base . $path . '</loc></url>' . "\n";
}
echo '</urlset>' . "\n";
