"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Pause, Play, RotateCcw, Flag, Heart, Download, Bluetooth, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Position {
  latitude: number;
  longitude: number;
  longitude_accuracy?: number;
  latitude_accuracy?: number;
  altitude?: number;
  altitude_accuracy?: number;
  timestamp: number;
}

interface Lap {
  number: number;
  time: string;
  distance: number;
  pace: string;
  avgHeartRate?: number;
}

interface Activity {
  startTime: number;
  endTime: number;
  totalTime: number;
  totalDistance: number;
  positions: Position[];
  heartRates: HeartRateData[];
  laps: Lap[];
}

interface HeartRateData {
  timestamp: number;
  heartRate: number;
}

interface BluetoothDevice {
  gatt?: {
    connect: () => Promise<BluetoothRemoteGATTServer>;
    connected: boolean;
    disconnect: () => void;
  };
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

interface BluetoothRemoteGATTServer {
  connect: () => Promise<BluetoothRemoteGATTServer>;
  getPrimaryService: (service: string) => Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic: (characteristic: string) => Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  startNotifications: () => Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  value?: DataView;
}

// Add Web Bluetooth API type declarations
// Define BluetoothServiceUUID type
type BluetoothServiceUUID = string | number;

interface Bluetooth {
  requestDevice(options: {
    filters?: Array<{
      services?: string[];
      name?: string;
      namePrefix?: string;
      manufacturerData?: Array<{ companyIdentifier: number; dataPrefix?: BufferSource }>;
      serviceData?: Array<{ service: BluetoothServiceUUID; dataPrefix?: BufferSource }>;
    }>;
    optionalServices?: string[];
    acceptAllDevices?: boolean;
  }): Promise<BluetoothDevice>;
}

// Extend Navigator interface globally
declare global {
  interface Navigator {
    bluetooth: Bluetooth;
  }
}

// Dynamically import the Map component to prevent SSR issues with Leaflet
const RunningMap = dynamic(() => import("./running-map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-64 bg-gray-100 rounded-lg">
      <span className="text-sm text-gray-500">Loading map...</span>
    </div>
  ),
});

export default function RunningTracker() {
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [currentPace, setCurrentPace] = useState("0:00");
  const [positions, setPositions] = useState<Position[]>([]);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [heartRateData, setHeartRateData] = useState<HeartRateData[]>([]);
  const [isHeartRateConnected, setIsHeartRateConnected] = useState(false);
  const [bluetoothSupported, setBluetoothSupported] = useState(true);
  const [activityCompleted, setActivityCompleted] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [showFullMap, setShowFullMap] = useState(false);
  const [activeTab, setActiveTab] = useState("stats");

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionsRef = useRef<Position[]>([]);
  const heartRateDeviceRef = useRef<BluetoothDevice | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Service Worker registered:", registration);
          })
          .catch((error) => {
            console.error("Service Worker registration failed:", error);
          });
      });
    }
  }, []);

  // Check if Web Bluetooth is supported
  useEffect(() => {
    if (!("bluetooth" in navigator)) {
      setBluetoothSupported(false);
    }
  }, []);

  // Install service worker for PWA support
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);

  // Start/stop the timer
  useEffect(() => {
    if (isRunning) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      timerRef.current = setInterval(() => {
        setTime((prevTime) => prevTime + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);

      // If we were running and now stopped, and we have data, prepare activity for export
      if (time > 0 && positions.length > 0) {
        const endTime = Date.now();
        setActivityCompleted(true);
        setActivity({
          startTime: startTimeRef.current || endTime - time * 1000,
          endTime: endTime,
          totalTime: time,
          totalDistance: distance,
          positions: [...positions],
          heartRates: [...heartRateData],
          laps: [...laps],
        });
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, time, positions.length, distance, positions, heartRateData, laps]);

  // Start/stop GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    if (isRunning && !watchId) {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          console.log("New position:", position);
          const newPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            latitude_accuracy: position.coords.accuracy,
            longitude_accuracy: position.coords.accuracy,
            altitude: position.coords.altitude || undefined,
            altitude_accuracy: position.coords.altitudeAccuracy || undefined,
            timestamp: position.timestamp,
          };
          setPositions((prev) => {
            const updated = [...prev, newPosition];
            lastPositionsRef.current = updated;
            return updated;
          });

          // Calculate distance if we have at least two positions
          if (lastPositionsRef.current.length > 1) {
            const newDistance = calculateTotalDistance(lastPositionsRef.current);
            setDistance(newDistance);

            // Calculate current pace (min/km)
            if (time > 0 && newDistance > 0) {
              // Get positions from last 30 seconds for current pace
              const recentPositions = getRecentPositions(lastPositionsRef.current, 30);
              if (recentPositions.length > 1) {
                const recentDistance = calculateTotalDistance(recentPositions);
                const recentTimeInMinutes = (recentPositions[recentPositions.length - 1].timestamp - recentPositions[0].timestamp) / 1000 / 60;

                if (recentTimeInMinutes > 0) {
                  const pace = recentTimeInMinutes / recentDistance;
                  setCurrentPace(formatPace(pace));
                }
              }
            }
          }
        },
        (err) => {
          if (err.code === 1) {
            // Permission denied
            setPermissionDenied(true);
          } else {
            setError(`Error: ${err.message}`);
          }
          setIsRunning(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000,
        }
      );
      setWatchId(id);
    } else if (!isRunning && watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isRunning, watchId]);

  // When the user starts running, switch to the map tab
  useEffect(() => {
    if (isRunning) {
      setActiveTab("map");
    }
  }, [isRunning]);

  const startStop = () => {
    setIsRunning(!isRunning);
  };

  const reset = () => {
    setIsRunning(false);
    setTime(0);
    setDistance(0);
    setCurrentPace("0:00");
    setPositions([]);
    setLaps([]);
    setHeartRateData([]);
    setActivityCompleted(false);
    setActivity(null);
    lastPositionsRef.current = [];
    startTimeRef.current = null;

    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  };

  const recordLap = () => {
    if (!isRunning) return;

    const lapNumber = laps.length + 1;
    const lapTime = formatTime(time);
    const lapDistance = distance;
    const lapPace = currentPace;

    // Calculate average heart rate for this lap if available
    let avgHeartRate: number | undefined = undefined;
    if (heartRateData.length > 0) {
      const sum = heartRateData.reduce((acc, data) => acc + data.heartRate, 0);
      avgHeartRate = Math.round(sum / heartRateData.length);
    }

    setLaps([
      ...laps,
      {
        number: lapNumber,
        time: lapTime,
        distance: lapDistance,
        pace: lapPace,
        avgHeartRate,
      },
    ]);
  };

  const connectHeartRateMonitor = async () => {
    try {
      if (!("bluetooth" in navigator)) {
        throw new Error("Web Bluetooth is not supported in your browser");
      }

      // Request device with heart rate service
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ["heart_rate"] }],
      });

      heartRateDeviceRef.current = device;

      device.addEventListener("gattserverdisconnected", () => {
        setIsHeartRateConnected(false);
        setHeartRate(null);
      });

      // Connect to GATT server
      const server = await device.gatt?.connect();
      if (!server) throw new Error("Failed to connect to GATT server");

      // Get heart rate service
      const service = await server.getPrimaryService("heart_rate");

      // Get heart rate measurement characteristic
      const characteristic = await service.getCharacteristic("heart_rate_measurement");

      // Start notifications
      await characteristic.startNotifications();

      // Listen for heart rate data
      characteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
        if (!event.target) return;
        const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
        const value = target.value;
        if (!value) return;

        // Parse heart rate data according to Bluetooth GATT specification
        const flags = value.getUint8(0);
        const rate = flags & 0x1 ? value.getUint16(1, true) : value.getUint8(1);

        setHeartRate(rate);

        // Store heart rate data with timestamp
        const hrData: HeartRateData = {
          timestamp: Date.now(),
          heartRate: rate,
        };

        setHeartRateData((prev) => [...prev, hrData]);
      });

      setIsHeartRateConnected(true);
    } catch (error) {
      console.error("Error connecting to heart rate monitor:", error);
      setError(`Failed to connect to heart rate monitor: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const disconnectHeartRateMonitor = async () => {
    if (heartRateDeviceRef.current?.gatt?.connected) {
      await heartRateDeviceRef.current.gatt.disconnect();
    }
    setIsHeartRateConnected(false);
    setHeartRate(null);
  };

  const exportGPX = () => {
    if (!activity) return;

    const gpx = generateGPX(activity);

    // Create a blob and download link
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    // Format date for filename
    const date = new Date(activity.startTime);
    const dateStr = date.toISOString().split("T")[0];

    a.href = url;
    a.download = `run_${dateStr}.gpx`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const generateGPX = (activity: Activity): string => {
    const startDate = new Date(activity.startTime).toISOString();

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Running Tracker App" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Running Activity</name>
    <time>${startDate}</time>
  </metadata>
  <trk>
    <name>Running Activity on ${startDate.split("T")[0]}</name>
    <trkseg>
`;

    // Add track points
    activity.positions.forEach((pos) => {
      const time = new Date(pos.timestamp).toISOString();
      gpx += `      <trkpt lat="${pos.latitude}" lon="${pos.longitude}">\n`;

      if (pos.altitude !== undefined) {
        gpx += `        <ele>${pos.altitude}</ele>\n`;
      }

      gpx += `        <time>${time}</time>\n`;

      // Find heart rate data closest to this position's timestamp
      const closestHR = findClosestHeartRate(activity.heartRates, pos.timestamp);
      if (closestHR) {
        gpx += `        <extensions>\n`;
        gpx += `          <gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n`;
        gpx += `            <gpxtpx:hr>${closestHR}</gpxtpx:hr>\n`;
        gpx += `          </gpxtpx:TrackPointExtension>\n`;
        gpx += `        </extensions>\n`;
      }

      gpx += `      </trkpt>\n`;
    });

    gpx += `    </trkseg>
  </trk>
</gpx>`;

    return gpx;
  };

  const findClosestHeartRate = (heartRates: HeartRateData[], timestamp: number): number | null => {
    if (heartRates.length === 0) return null;

    let closest = heartRates[0];
    let minDiff = Math.abs(timestamp - closest.timestamp);

    for (let i = 1; i < heartRates.length; i++) {
      const diff = Math.abs(timestamp - heartRates[i].timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = heartRates[i];
      }
    }

    // Only return if within 10 seconds
    return minDiff <= 10000 ? closest.heartRate : null;
  };

  // Helper functions
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatPace = (pace: number): string => {
    const minutes = Math.floor(pace);
    const seconds = Math.floor((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDistance = (dist: number): string => {
    return dist.toFixed(2);
  };

  const calculateDistance = (pos1: Position, pos2: Position): number => {
    // Haversine formula to calculate distance between two points
    const R = 6371; // Earth's radius in km
    const dLat = deg2rad(pos2.latitude - pos1.latitude);
    const dLon = deg2rad(pos2.longitude - pos1.longitude);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(pos1.latitude)) * Math.cos(deg2rad(pos2.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  const deg2rad = (deg: number): number => {
    return deg * (Math.PI / 180);
  };

  const calculateTotalDistance = (positions: Position[]): number => {
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      total += calculateDistance(positions[i - 1], positions[i]);
    }
    return total;
  };

  const getRecentPositions = (positions: Position[], seconds: number): Position[] => {
    if (positions.length <= 1) return positions;

    const now = positions[positions.length - 1].timestamp;
    const cutoff = now - seconds * 1000;

    return positions.filter((pos) => pos.timestamp >= cutoff);
  };

  // Show the full-screen map view
  const toggleFullMap = () => {
    setShowFullMap(!showFullMap);
  };

  // Main stats panel
  const renderStatsPanel = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center p-4 bg-white rounded-lg shadow-sm">
          <span className="text-sm text-gray-500">Time</span>
          <span className="text-3xl font-bold tabular-nums">{formatTime(time)}</span>
        </div>
        <div className="flex flex-col items-center p-4 bg-white rounded-lg shadow-sm">
          <span className="text-sm text-gray-500">Distance (km)</span>
          <span className="text-3xl font-bold tabular-nums">{formatDistance(distance)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center p-4 bg-primary/10 rounded-lg">
          <span className="text-sm text-gray-500">Current Pace</span>
          <span className="text-2xl font-bold tabular-nums">{currentPace}</span>
          <span className="text-xs text-gray-500">min/km</span>
        </div>

        <div className={cn("flex flex-col items-center p-4 rounded-lg", isHeartRateConnected ? "bg-red-100" : "bg-gray-100")}>
          <div className="flex items-center gap-1">
            <Heart className={cn("w-4 h-4", isHeartRateConnected ? "text-red-500" : "text-gray-400")} />
            <span className="text-sm text-gray-500">Heart Rate</span>
          </div>
          {isHeartRateConnected ? (
            <span className="text-2xl font-bold tabular-nums text-red-500">{heartRate || "--"}</span>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="mt-1" disabled={!bluetoothSupported || isRunning}>
                  <Bluetooth className="w-3 h-3 mr-1" />
                  Connect
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect Heart Rate Monitor</DialogTitle>
                  <DialogDescription>Select your Bluetooth heart rate monitor device.</DialogDescription>
                </DialogHeader>

                {!bluetoothSupported ? (
                  <Alert variant="destructive">
                    <AlertDescription>Web Bluetooth is not supported in your browser. Please use Chrome or Edge on desktop or Android.</AlertDescription>
                  </Alert>
                ) : (
                  <div className="py-4">
                    <p className="mb-4 text-sm text-gray-500">Make sure your heart rate monitor is turned on and in pairing mode.</p>
                    <Button onClick={connectHeartRateMonitor} className="w-full">
                      Search for Devices
                    </Button>
                  </div>
                )}

                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <span className="text-xs text-gray-500">bpm</span>
        </div>
      </div>

      {laps.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 font-semibold">Laps</h3>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">Lap</th>
                  <th className="py-2 text-left">Time</th>
                  <th className="py-2 text-left">Distance</th>
                  <th className="py-2 text-left">Pace</th>
                  {heartRateData.length > 0 && <th className="py-2 text-left">HR</th>}
                </tr>
              </thead>
              <tbody>
                {laps.map((lap) => (
                  <tr key={lap.number} className="border-b">
                    <td className="py-2">{lap.number}</td>
                    <td className="py-2">{lap.time}</td>
                    <td className="py-2">{formatDistance(lap.distance)} km</td>
                    <td className="py-2">{lap.pace}</td>
                    {heartRateData.length > 0 && <td className="py-2">{lap.avgHeartRate || "--"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  // Map panel
  const renderMapPanel = () => (
    <div className="relative">
      <div className="h-[300px] rounded-lg overflow-hidden">
        <RunningMap positions={positions} currentPosition={positions.length > 0 ? positions[positions.length - 1] : undefined} />
      </div>
      <Button variant="outline" size="sm" className="absolute top-2 right-2 bg-white shadow-sm" onClick={toggleFullMap}>
        <MapPin className="w-4 h-4" />
        <span className="ml-1">Expand</span>
      </Button>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm">
          <span className="text-xs text-gray-500">Distance</span>
          <span className="text-xl font-bold tabular-nums">{formatDistance(distance)}</span>
        </div>
        <div className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm">
          <span className="text-xs text-gray-500">Time</span>
          <span className="text-xl font-bold tabular-nums">{formatTime(time)}</span>
        </div>
        <div className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm">
          <span className="text-xs text-gray-500">Pace</span>
          <span className="text-xl font-bold tabular-nums">{currentPace}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Full screen map when toggled */}
      {showFullMap && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="h-screen relative">
            <RunningMap positions={positions} currentPosition={positions.length > 0 ? positions[positions.length - 1] : undefined} fullScreen />
            <Button variant="outline" size="icon" className="absolute top-4 right-4 bg-white shadow-md rounded-full" onClick={toggleFullMap}>
              <X className="w-4 h-4" />
            </Button>
            <div className="absolute bottom-24 left-0 right-0 flex justify-center">
              <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Distance</div>
                  <div className="font-bold">{formatDistance(distance)} km</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Time</div>
                  <div className="font-bold">{formatTime(time)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Pace</div>
                  <div className="font-bold">{currentPace}</div>
                </div>
                {isHeartRateConnected && (
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Heart Rate</div>
                    <div className="font-bold text-red-500">{heartRate || "--"}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Running Tracker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {permissionDenied ? (
              <div className="p-4 text-center text-red-500 bg-red-50 rounded-md">Location permission denied. Please enable location services to use this app.</div>
            ) : error ? (
              <div className="p-4 text-center text-red-500 bg-red-50 rounded-md">{error}</div>
            ) : (
              <>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="stats">Stats</TabsTrigger>
                    <TabsTrigger value="map">Map</TabsTrigger>
                  </TabsList>
                  <TabsContent value="stats" className="space-y-4 mt-2">
                    {renderStatsPanel()}
                  </TabsContent>
                  <TabsContent value="map" className="mt-2">
                    {renderMapPanel()}
                  </TabsContent>
                </Tabs>

                {activityCompleted && (
                  <div className="flex justify-center mt-2">
                    <Button variant="outline" size="sm" onClick={exportGPX} className="flex items-center gap-1">
                      <Download className="w-4 h-4" />
                      Export GPX
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" size="icon" onClick={reset} disabled={permissionDenied}>
              <RotateCcw className="w-5 h-5" />
            </Button>

            <Button variant="default" size="lg" onClick={startStop} disabled={permissionDenied} className={cn("px-8", isRunning ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600")}>
              {isRunning ? <Pause className="w-5 h-5 mr-2" /> : <Play className="w-5 h-5 mr-2" />}
              {isRunning ? "Pause" : "Start"}
            </Button>

            <Button variant="outline" size="icon" onClick={recordLap} disabled={!isRunning || permissionDenied}>
              <Flag className="w-5 h-5" />
            </Button>
          </CardFooter>
        </Card>

        {isHeartRateConnected && (
          <Button variant="outline" size="sm" onClick={disconnectHeartRateMonitor} className="mt-4">
            Disconnect Heart Rate Monitor
          </Button>
        )}
      </div>
    </>
  );
}
