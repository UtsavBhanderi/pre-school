import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import axios from 'axios';

// Register components required for the chart
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const Graph = () => {
  const [feeData, setFeeData] = useState({
    standardWise: [],
    dateWise: [],
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
  });

  useEffect(() => {
    const fetchFeesData = async () => {
      try {
        const response = await axios.get('/api/fees/fees-collection-data');
        setFeeData(response.data);
      } catch (error) {
        console.error('Error fetching fee data', error);
      }
    };

    fetchFeesData();
  }, []);

  // Data for Standard-wise Bar Chart
  const standardWiseData = {
    labels: feeData.standardWise.map(item => item._id),
    datasets: [
      {
        label: 'Standard-wise Fees Collection',
        data: feeData.standardWise.map(item => item.totalPaid),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
    ],
  };

  // Data for Date-wise Line Chart
  const dateWiseData = {
    labels: feeData.dateWise.map(item => item._id),
    datasets: [
      {
        label: 'Date-wise Fees Collection',
        data: feeData.dateWise.map(item => item.totalPaid),
        backgroundColor: 'rgba(153, 102, 255, 0.6)',
        borderColor: 'rgba(153, 102, 255, 1)',
        fill: true,
      },
    ],
  };

  return (
    <div className="container mt-5">
      <h1 className="mb-4">Fees Collection Overview</h1>

      {/* Numerical Display */}
      <div className="row">
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Today's Collection</h5>
              <p className="card-text">₹{feeData.today}</p>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">This Week's Collection</h5>
              <p className="card-text">₹{feeData.thisWeek}</p>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">This Month's Collection</h5>
              <p className="card-text">₹{feeData.thisMonth}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bar Chart for Standard-wise Collection */}
      <div className="row mt-5">
        <div className="col-md-6">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Standard-wise Fees Collection</h5>
              <Bar data={standardWiseData} options={{ maintainAspectRatio: false }} />
            </div>
          </div>
        </div>

        {/* Line Chart for Date-wise Collection */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Date-wise Fees Collection</h5>
              <Line data={dateWiseData} options={{ maintainAspectRatio: false }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Graph;
