const vt2geojson = require('vt2geojson');

// remote file
vt2geojson({
    // The local or cloud URL to your MVT tile',
    uri: 'http://localhost:8000/api/mvt/public/germany_counties/9/270/176.pbf',
    layer: 'germany_counties_layer'
}, function (err, result) {
    if (err) throw err;

    // Option 1: Pretty-print the entire GeoJSON
    console.log(JSON.stringify(result, null, 2));

    // Option 2: Loop through and print each feature
    result.features.forEach((feature, idx) => {
        console.log(`Feature ${idx + 1}:`);
        console.log("Properties:", feature.properties);
        console.log("Geometry:", JSON.stringify(feature.geometry));
        console.log('---');
    });
});
