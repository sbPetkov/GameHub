import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);

  return (
    <nav className="bg-indigo-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="text-xl font-bold">GameHub</Link>
          </div>
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="text-indigo-100">Welcome, {user.username}</span>
                <span className="bg-indigo-700 px-3 py-1 rounded text-sm">
                  Wins: {user.wins}
                </span>
                <button 
                  onClick={logout}
                  className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-indigo-200">Login</Link>
                <Link to="/register" className="bg-white text-indigo-600 px-3 py-1 rounded hover:bg-indigo-50 transition">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
