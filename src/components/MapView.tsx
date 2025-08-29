import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, Navigation, Zap, Plus, Minus } from "lucide-react";
// Temporarily disabled for testing
// import { Incident } from "@/lib/firebase-services";

interface MapViewProps {
  onLocationSelect?: (location: {lat: number, lng: number}) => void;
  onLocationChange?: (location: {lat: number, lng: number, city?: string}) => void;
  incidents?: any[]; // Temporarily using any for testing
  onIncidentAdded?: (incident: any) => void; // Callback when new incident is added
}

export const MapView = ({ onLocationSelect, onLocationChange, incidents = [] }: MapViewProps) => {
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);

  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  // Default to Vellore, Tamil Nadu (where you are)
  const DEFAULT_LOCATION = { lat: 12.9716, lng: 79.1604 }; // Vellore coordinates

  // Function to get city name from coordinates
  const getCityFromCoordinates = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const addressComponents = data.results[0].address_components;
        // Look for locality (city) or administrative_area_level_1 (state)
        const city = addressComponents.find((component: any) => 
          component.types.includes('locality') || 
          component.types.includes('administrative_area_level_1')
        );
        
        if (city) {
          return city.long_name;
        }
      }
      
      // Fallback: return coordinates if city not found
      return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    } catch (error) {
      console.error('Error getting city name:', error);
      return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    }
  };

  // Google Maps API Key
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // Load Google Maps API
  useEffect(() => {
    const loadGoogleMaps = () => {
      console.log('Loading Google Maps API...');
      console.log('API Key:', GOOGLE_MAPS_API_KEY);
      console.log('Current domain:', window.location.hostname);
      
      if (window.google && window.google.maps) {
        console.log('Google Maps already loaded');
        initializeMap();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        console.log('Google Maps API script loaded successfully');
        initializeMap();
      };
      
      script.onerror = (error) => {
        console.error('Failed to load Google Maps API:', error);
        console.error('Script src:', script.src);
        console.error('Error details:', {
          apiKey: GOOGLE_MAPS_API_KEY,
          domain: window.location.hostname,
          userAgent: navigator.userAgent
        });
        setMapLoaded(false);
      };
      
      document.head.appendChild(script);
      console.log('Google Maps script added to DOM');
    };

    loadGoogleMaps();
  }, []);

  // Initialize Google Map
  const initializeMap = () => {
    if (!mapRef.current || !window.google) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: currentLocation || DEFAULT_LOCATION,
      zoom: 12,
      mapTypeId: window.google.maps.MapTypeId.ROADMAP,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: false,
      zoomControl: false, // We'll add custom zoom controls
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "on" }]
        },
        {
          featureType: "transit",
          elementType: "labels",
          stylers: [{ visibility: "on" }]
        }
      ]
    });

    googleMapRef.current = map;
    setMapLoaded(true);

    // Add map click listener
    map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (event.latLng) {
        const location = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        };
        console.log('Map clicked at:', location);
        
        // Update selected location
        setSelectedLocation(location);
        
        // Notify parent component about location selection
        if (onLocationSelect) {
          console.log('Notifying parent component about location selection:', location);
          onLocationSelect(location);
        }
        
        // Center map on clicked location
        map.setCenter(location);
      }
    });


  };

  // Get current location on component mount
  useEffect(() => {
    // Check if we already have location data stored
    const storedLocation = localStorage.getItem('userLocation');
    const storedCity = localStorage.getItem('userCity');
    
    if (storedLocation && storedCity) {
      try {
        const location = JSON.parse(storedLocation);
        setCurrentLocation(location);
        
        // Only set selected location if none is currently selected
        if (!selectedLocation) {
          setSelectedLocation(location);
        }
        
        // Notify parent with stored location
        if (onLocationChange) {
          onLocationChange({ ...location, city: storedCity });
        }
        
        // Center map on stored location
        if (googleMapRef.current && !selectedLocation) {
          googleMapRef.current.setCenter(location);
        }
        return; // Don't request location again
      } catch (error) {
        // If stored data is invalid, clear it and continue
        localStorage.removeItem('userLocation');
        localStorage.removeItem('userCity');
      }
    }
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(location);
          
          // Only set selected location if none is currently selected
          if (!selectedLocation) {
            setSelectedLocation(location);
          }
          
          // Get city name and notify parent component
          try {
            const city = await getCityFromCoordinates(location.lat, location.lng);
            
            if (onLocationChange) {
              onLocationChange({ ...location, city });
            }
            
            // Store location and city for future use
            localStorage.setItem('userLocation', JSON.stringify(location));
            localStorage.setItem('userCity', city);
          } catch (error) {
            console.error('Error getting city name:', error);
          }
          
          // Center map on current location only if no location is selected
          if (googleMapRef.current && !selectedLocation) {
            googleMapRef.current.setCenter(location);
          }
        },
        (error) => {
          console.error("Error getting current location:", error);
          // Fallback to Vellore coordinates
          setCurrentLocation(DEFAULT_LOCATION);
          
          // Only set selected location if none is currently selected
          if (!selectedLocation) {
            setSelectedLocation(DEFAULT_LOCATION);
          }
          
          // Notify parent with default location
          if (onLocationChange) {
            onLocationChange({ ...DEFAULT_LOCATION, city: 'Vellore' });
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    } else {
      // Fallback to Vellore coordinates if geolocation not supported
      setCurrentLocation(DEFAULT_LOCATION);
      
      // Only set selected location if none is currently selected
      if (!selectedLocation) {
        setSelectedLocation(DEFAULT_LOCATION);
      }
      
      // Notify parent with default location
      if (onLocationChange) {
        onLocationChange({ ...DEFAULT_LOCATION, city: 'Vellore' });
      }
    }
  }, [onLocationChange, selectedLocation]);





  const getSeverityColor = (severity: number) => {
    const colors = {
      1: "#10b981", // green
      2: "#f59e0b", // yellow
      3: "#f97316", // orange
      4: "#ef4444", // red
      5: "#dc2626"  // dark red
    };
    return colors[severity as keyof typeof colors] || "#6b7280";
  };

  // Update incidents on map
  useEffect(() => {
    if (!googleMapRef.current || !mapLoaded) return;

    console.log('MapView: Updating incidents on map:', incidents);

    // Clear only incident markers, keep selected location marker
    markersRef.current.forEach(marker => {
      if (marker.getTitle() !== 'Selected Location') {
        marker.setMap(null);
      }
    });

    // Remove incident markers from array
    markersRef.current = markersRef.current.filter(marker => 
      marker.getTitle() === 'Selected Location'
    );

    // Add new markers for incidents
    incidents.forEach((incident) => {
      console.log('MapView: Processing incident:', incident);
      console.log('MapView: Incident location:', incident.location);
      console.log('MapView: Incident AI analysis:', incident.aiAnalysis);
      
      if (!incident.location) {
        console.log('MapView: Skipping incident - no location');
        return;
      }

      const marker = new window.google.maps.Marker({
        position: { lat: incident.location.lat, lng: incident.location.lng },
        map: googleMapRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
                  fillColor: incident.aiAnalysis?.severity 
          ? getSeverityColor(incident.aiAnalysis.severity) 
          : '#6b7280',
        fillOpacity: 0.8,
        strokeColor: 'white',
        strokeWeight: 2
      },
      title: `${incident.aiAnalysis?.category || 'Unknown'} - Level ${incident.aiAnalysis?.severity || 'N/A'} - ${incident.description?.substring(0, 50)}...`,
      zIndex: incident.aiAnalysis?.severity || 3
      });

      // Add click listener to show incident info
      marker.addListener('click', () => {
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 12px; max-width: 250px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
              <h3 style="margin: 0 0 10px 0; font-weight: bold; color: #1f2937; font-size: 14px;">${incident.aiAnalysis?.category || 'Unknown Issue'}</h3>
              <p style="margin: 0 0 10px 0; font-size: 13px; color: #374151; line-height: 1.4;">${incident.description?.substring(0, 100)}...</p>
              <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                <span style="font-size: 12px; color: #059669; font-weight: 500;">Severity: Level ${incident.aiAnalysis?.severity || 'N/A'}</span>
                <span style="font-size: 12px; color: #dc2626; font-weight: 500;">Status: ${incident.status || 'Unknown'}</span>
              </div>
            </div>
          `
        });
        infoWindow.open(googleMapRef.current, marker);
      });

      markersRef.current.push(marker);
      console.log('MapView: Added marker for incident:', incident.id);
    });
  }, [incidents, mapLoaded]);

  // Update selected location marker
  useEffect(() => {
    if (!googleMapRef.current || !mapLoaded) return;

    // Clear ALL previous selected location markers
    markersRef.current.forEach(marker => {
      if (marker.getTitle() === 'Selected Location') {
        marker.setMap(null);
      }
    });

    // Remove selected location markers from array
    markersRef.current = markersRef.current.filter(marker => 
      marker.getTitle() !== 'Selected Location'
    );

    // Only add marker if there's a selected location
    if (selectedLocation) {
      const marker = new window.google.maps.Marker({
        position: selectedLocation,
        map: googleMapRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 3
        },
        title: 'Selected Location'
        // Removed animation: window.google.maps.Animation.BOUNCE
      });

      markersRef.current.push(marker);
    }
  }, [selectedLocation, mapLoaded]);

  // Remove this duplicate effect that was causing the blinking

  // Function to select current location
  const handleSelectCurrentLocation = () => {
    if (currentLocation) {
      console.log('Selecting current location:', currentLocation);
      setSelectedLocation(currentLocation);
      
      // Notify parent component
      if (onLocationSelect) {
        onLocationSelect(currentLocation);
      }
      
      // Center map on current location
      if (googleMapRef.current) {
        googleMapRef.current.setCenter(currentLocation);
        googleMapRef.current.setZoom(15); // Zoom to street level
      }
    }
  };

  // Function to add a new incident marker
  const addIncidentMarker = (incident: any) => {
    if (!googleMapRef.current || !mapLoaded || !incident.location) return;

    const marker = new window.google.maps.Marker({
      position: { lat: incident.location.lat, lng: incident.location.lng },
      map: googleMapRef.current,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: incident.aiAnalysis?.severity 
          ? getSeverityColor(incident.aiAnalysis.severity) 
          : '#6b7280',
        fillOpacity: 0.8,
        strokeColor: 'white',
        strokeWeight: 2
      },
      title: `${incident.aiAnalysis?.category || 'Unknown'} - Level ${incident.aiAnalysis?.severity || 'N/A'} - ${incident.description?.substring(0, 50)}...`,
      zIndex: incident.aiAnalysis?.severity || 3
    });

    // Add click listener to show incident info
    marker.addListener('click', () => {
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 12px; max-width: 250px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <h3 style="margin: 0 0 10px 0; font-weight: bold; color: #1f2937; font-size: 14px;">${incident.aiAnalysis?.category || 'Unknown Issue'}</h3>
            <p style="margin: 0 0 10px 0; font-size: 13px; color: #374151; line-height: 1.4;">${incident.description?.substring(0, 100)}...</p>
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #e5e7eb;">
              <span style="font-size: 12px; color: #059669; font-weight: 500;">Severity: Level ${incident.aiAnalysis?.severity || 'N/A'}</span>
              <span style="font-size: 12px; color: #dc2626; font-weight: 500;">Status: ${incident.status || 'Unknown'}</span>
            </div>
          </div>
        `
      });
      infoWindow.open(googleMapRef.current, marker);
    });

    markersRef.current.push(marker);
  };

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden" style={{ minHeight: '500px' }}>
      {/* Google Maps Container */}
      <div 
        ref={mapRef}
        className="w-full h-full"
        style={{ minHeight: '500px' }}
      />

      {/* Loading state */}
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 z-40">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-lg font-medium">Loading Google Maps...</p>
            <p className="text-sm text-muted-foreground">Getting your location and map data</p>
            <p className="text-xs text-muted-foreground mt-2">API Key: {GOOGLE_MAPS_API_KEY.substring(0, 10)}...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {mapLoaded === false && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-600 via-red-700 to-red-800 z-40">
          <div className="text-center text-white p-6">
            <div className="text-6xl mb-4">🗺️</div>
            <h3 className="text-xl font-bold mb-2">Google Maps Failed to Load</h3>
            <p className="text-sm mb-4">Please check the browser console for details</p>
            <div className="bg-black/20 p-3 rounded text-xs">
              <p><strong>Domain:</strong> {window.location.hostname}</p>
              <p><strong>API Key:</strong> {GOOGLE_MAPS_API_KEY.substring(0, 15)}...</p>
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              className="mt-4 bg-white text-red-800 hover:bg-gray-100"
            >
              Retry Loading
            </Button>
          </div>
        </div>
      )}

      {/* Select Current Button */}
      <div className="absolute top-4 right-4 z-30">
        <Button
          size="sm"
          onClick={handleSelectCurrentLocation}
          disabled={!currentLocation}
          className="bg-card/80 backdrop-blur-sm hover:bg-card/90 text-foreground border border-border/50"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Select Current
        </Button>
      </div>





      {/* Map Legend */}
      <Card className="absolute bottom-4 left-4 p-3 bg-card/80 backdrop-blur-sm z-30">
        <div className="text-xs font-medium mb-2">Severity Levels</div>
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((level) => (
            <div key={level} className="flex items-center space-x-2 text-xs">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getSeverityColor(level) }}
              />
              <span>Level {level}</span>
            </div>
          ))}
        </div>
      </Card>


    </div>
  );
};