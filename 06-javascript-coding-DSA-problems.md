Here are the answers to your questions, designed to be clear, simple, and easy to understand with commented code.

### **Array-Based Questions**

These questions test your ability to manipulate and process collections of data efficiently, a common task in frontend development.

**1. Remove Duplicates from an Array: Write a function to filter out duplicate values from an array.**

```javascript
function removeDuplicates(arr) {
  // Create an empty array to store unique elements.
  const uniqueArray = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // Check if the current element is already in the uniqueArray.
    if (uniqueArray.indexOf(arr[i]) === -1) {
      // If it's not present, add it to the uniqueArray.
      uniqueArray.push(arr[i]);
    }
  }

  // Return the array with unique elements.
  return uniqueArray;
}
```

**2. Flatten a Deeply Nested Array: Implement a function to flatten an array of arbitrarily nested arrays into a single-level array.**

```javascript
function flattenArray(arr) {
  // Create an empty array to store the flattened elements.
  const flattened = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // Check if the current element is an array.
    if (Array.isArray(arr[i])) {
      // If it is an array, recursively call flattenArray on it
      // and concatenate the result to the flattened array.
      flattened.push(...flattenArray(arr[i]));
    } else {
      // If it's not an array, push the element directly.
      flattened.push(arr[i]);
    }
  }

  // Return the flattened array.
  return flattened;
}
```

**3. Two Sum: Given an array of integers, find two numbers that add up to a specific target.**

```javascript
function twoSum(nums, target) {
  // Create an object to store numbers we've seen and their indices.
  const numMap = {};

  // Loop through each number in the array.
  for (let i = 0; i < nums.length; i++) {
    // Calculate the complement needed to reach the target.
    const complement = target - nums[i];

    // Check if the complement exists in our map.
    if (numMap[complement] !== undefined) {
      // If it exists, we've found our pair.
      // Return the index of the complement and the current index.
      return [numMap[complement], i];
    }

    // If the complement is not found, store the current number and its index in the map.
    numMap[nums[i]] = i;
  }
}
```

**4. Merge Two Sorted Arrays: Write a function that merges two sorted arrays into a single sorted array without using built-in sort functions.**

Of course, let's continue.

```javascript
function mergeSortedArrays(arr1, arr2) {
  // Create an empty array to store the merged result.
  const mergedArray = [];
  // Initialize pointers for both arrays.
  let i = 0; // Pointer for arr1
  let j = 0; // Pointer for arr2

  // Loop as long as there are elements in both arrays.
  while (i < arr1.length && j < arr2.length) {
    // Compare the elements at the current pointers.
    if (arr1[i] < arr2[j]) {
      // If the element in arr1 is smaller, push it to the merged array.
      mergedArray.push(arr1[i]);
      // Move the pointer for arr1 forward.
      i++;
    } else {
      // If the element in arr2 is smaller or equal, push it.
      mergedArray.push(arr2[j]);
      // Move the pointer for arr2 forward.
      j++;
    }
  }

  // After the main loop, one of the arrays may still have elements left.
  // Add all remaining elements from arr1, if any.
  while (i < arr1.length) {
    mergedArray.push(arr1[i]);
    i++;
  }

  // Add all remaining elements from arr2, if any.
  while (j < arr2.length) {
    mergedArray.push(arr2[j]);
    j++;
  }

  // Return the final merged and sorted array.
  return mergedArray;
}
```

**5. Move Zeroes to the End: Rearrange an array to move all zeroes to the end while maintaining the relative order of the non-zero elements.**

```javascript
function moveZeroes(nums) {
  // Initialize a pointer to place the next non-zero number.
  let nonZeroIndex = 0;

  // First loop: move all non-zero elements to the front.
  for (let i = 0; i < nums.length; i++) {
    // If the current element is not zero...
    if (nums[i] !== 0) {
      // ...move it to the position indicated by nonZeroIndex.
      nums[nonZeroIndex] = nums[i];
      // Increment the pointer for the next non-zero element.
      nonZeroIndex++;
    }
  }

  // Second loop: fill the rest of the array with zeroes.
  // This loop starts where the last non-zero element was placed.
  for (let i = nonZeroIndex; i < nums.length; i++) {
    // Fill the remaining spots with 0.
    nums[i] = 0;
  }

  // Return the modified array.
  return nums;
}
```

**6. Rotate Array: Rotate the elements of an array to the right by a specified number of steps, `k`.**

```javascript
function rotateArray(nums, k) {
  // Handle cases where k is larger than the array length.
  // The result of rotation by k is the same as rotation by k % length.
  const rotations = k % nums.length;

  // Perform the rotation `rotations` number of times.
  for (let i = 0; i < rotations; i++) {
    // Remove the last element from the array.
    const lastElement = nums.pop();
    // Add that element to the beginning of the array.
    nums.unshift(lastElement);
  }

  // Return the rotated array.
  return nums;
}
```

**7. Find the Missing Number: Given an array containing n distinct numbers taken from 0, 1, 2, ..., n, find the one that is missing.**

```javascript
function findMissingNumber(nums) {
  // The length of the array is n, because it's missing one number from the 0 to n sequence.
  const n = nums.length;

  // Calculate the expected sum of numbers from 0 to n.
  // The formula for the sum of an arithmetic series is n * (n + 1) / 2.
  const expectedSum = n * (n + 1) / 2;

  // Calculate the actual sum of the elements in the given array.
  let actualSum = 0;
  for (let i = 0; i < nums.length; i++) {
    actualSum += nums[i];
  }

  // The missing number is the difference between the expected sum and the actual sum.
  return expectedSum - actualSum;
}```

**8. Maximum Subarray Sum (Kadane's Algorithm): Find the contiguous subarray with the largest sum and return its sum.**

```javascript
function maxSubarraySum(nums) {
  // Initialize the maximum sum to the first element of the array.
  let maxSoFar = nums[0];
  // Initialize the sum of the current subarray.
  let maxEndingHere = nums[0];

  // Loop through the array starting from the second element.
  for (let i = 1; i < nums.length; i++) {
    // Decide whether to extend the current subarray or start a new one.
    // We take the larger of either the current number itself or the current number added to the previous subarray sum.
    maxEndingHere = Math.max(nums[i], maxEndingHere + nums[i]);
    
    // Update the overall maximum sum if the current subarray sum is greater.
    maxSoFar = Math.max(maxSoFar, maxEndingHere);
  }

  // Return the largest sum found.
  return maxSoFar;
}
```

**9. Product of Array Except Self: Given an array `nums`, return an array `answer` such that `answer[i]` is equal to the product of all the elements of `nums` except `nums[i]`.**

```javascript
function productExceptSelf(nums) {
  const n = nums.length;
  // Initialize the result array with all elements as 1.
  const answer = new Array(n).fill(1);

  // First pass: Calculate the product of all elements to the left of each index.
  let leftProduct = 1;
  for (let i = 0; i < n; i++) {
    // Set the answer at the current index to the product of elements to its left.
    answer[i] = leftProduct;
    // Update the left product for the next iteration.
    leftProduct *= nums[i];
  }

  // Second pass: Calculate the product of all elements to the right and combine it.
  let rightProduct = 1;
  for (let i = n - 1; i >= 0; i--) {
    // Multiply the current answer (which holds the left product) by the right product.
    answer[i] *= rightProduct;
    // Update the right product for the next iteration.
    rightProduct *= nums[i];
  }

  // Return the final answer array.
  return answer;
}
```

**10. Find the Second Largest Number: Write a function to find the second largest number in an array of numbers.**

```javascript
function findSecondLargest(nums) {
  // Initialize largest and secondLargest.
  // Using negative infinity ensures any number in the array will be larger.
  let largest = -Infinity;
  let secondLargest = -Infinity;

  // Handle edge case of an array with less than two numbers.
  if (nums.length < 2) {
    return "Array must contain at least two numbers.";
  }

  // Loop through the array to find the largest and second largest numbers.
  for (let i = 0; i < nums.length; i++) {
    // If the current number is greater than the current largest...
    if (nums[i] > largest) {
      // ...the old largest becomes the new second largest.
      secondLargest = largest;
      // ...and the current number becomes the new largest.
      largest = nums[i];
    } 
    // If the current number is smaller than largest but greater than secondLargest...
    else if (nums[i] > secondLargest && nums[i] < largest) {
      // ...it becomes the new second largest.
      secondLargest = nums[i];
    }
  }

  // Return the second largest number found.
  return secondLargest;
}
```

---

Of course, here are the next set of answers.

**11. Remove Falsy Values: Create a function that removes all falsy values (e.g., `false`, `null`, `0`, `""`, `undefined`, and `NaN`) from an array.**

```javascript
function removeFalsyValues(arr) {
  // Create an empty array to store the truthy values.
  const truthyArray = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // In JavaScript, a simple `if` condition checks for truthiness.
    // Falsy values (false, null, 0, "", undefined, NaN) will evaluate to false.
    if (arr[i]) {
      // If the value is truthy, add it to our new array.
      truthyArray.push(arr[i]);
    }
  }

  // Return the array containing only truthy values.
  return truthyArray;
}
```

**12. Sort an Array of Objects by a Key: Given an array of objects, write a function to sort them based on the value of a specific key.**

```javascript
function sortObjectsByKey(arr, key) {
  // Use the built-in sort method, which accepts a custom comparison function.
  // This is the standard way to sort non-numeric or complex data.
  arr.sort((a, b) => {
    // Access the values to compare using the provided key.
    const valueA = a[key];
    const valueB = b[key];

    // The comparison function should return:
    // - A negative number if valueA should come before valueB.
    // - A positive number if valueA should come after valueB.
    // - Zero if their order doesn't matter.
    if (valueA < valueB) {
      return -1; // a comes first
    }
    if (valueA > valueB) {
      return 1; // b comes first
    }
    return 0; // order is unchanged
  });

  // The sort method modifies the array in place, so we can just return it.
  return arr;
}
```

**13. Group Anagrams: Given an array of strings, group the anagrams together.**

```javascript
function groupAnagrams(strs) {
  // Create an object (acting as a hash map) to store groups of anagrams.
  const anagramGroups = {};

  // Loop through each string in the input array.
  for (const str of strs) {
    // Create a canonical representation for each string by sorting its characters.
    // "eat" -> "aet", "tea" -> "aet", "ate" -> "aet"
    const sortedStr = str.split('').sort().join('');

    // Check if this sorted key already exists in our map.
    if (anagramGroups[sortedStr]) {
      // If it exists, push the original string into the corresponding array.
      anagramGroups[sortedStr].push(str);
    } else {
      // If it doesn't exist, create a new array for this key and add the string.
      anagramGroups[sortedStr] = [str];
    }
  }

  // The values of the map are the arrays of anagrams.
  // Return an array of these values.
  return Object.values(anagramGroups);
}
```

**14. Implement `Array.prototype.map`: Re-create the functionality of the `map` method without using the native method.**

```javascript
function customMap(arr, callback) {
  // Create a new empty array to store the results.
  const newArray = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // Call the provided callback function for each element.
    // The callback receives the element, its index, and the original array.
    const result = callback(arr[i], i, arr);
    // Push the result of the callback into the new array.
    newArray.push(result);
  }

  // Return the new array with the transformed elements.
  return newArray;
}
```

**15. Implement `Array.prototype.filter`: Re-create the functionality of the `filter` method without using the native method.**

```javascript
function customFilter(arr, callback) {
  // Create a new empty array to store the filtered elements.
  const filteredArray = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // Call the provided callback function for each element.
    // The callback should return a boolean value.
    if (callback(arr[i], i, arr)) {
      // If the callback returns a truthy value, push the original element into the new array.
      filteredArray.push(arr[i]);
    }
  }

  // Return the new array containing only the elements that passed the filter.
  return filteredArray;
}
```

Of course, let's proceed with the next questions.

**16. Subarray with Given Sum: Find a contiguous subarray that adds to a given sum.**

```javascript
function subarraySum(arr, targetSum) {
  // Initialize a variable to keep track of the current subarray's sum.
  let currentSum = 0;
  // Initialize a pointer for the start of the sliding window.
  let start = 0;

  // Loop through the array with the 'end' pointer of the sliding window.
  for (let end = 0; end < arr.length; end++) {
    // Add the current element to the window's sum.
    currentSum += arr[end];

    // As long as the current sum is greater than the target and the window is valid...
    while (currentSum > targetSum && start <= end) {
      // ...shrink the window from the left by subtracting the start element.
      currentSum -= arr[start];
      // Move the start pointer to the right.
      start++;
    }

    // Check if the current sum equals the target.
    if (currentSum === targetSum) {
      // If it does, return the subarray found.
      // We slice from the start index to the end index + 1.
      return arr.slice(start, end + 1);
    }
  }

  // If no such subarray is found after checking all possibilities, return null or an empty array.
  return null;
}
```

**17. Intersection of Two Arrays: Find the common elements between two arrays.**

```javascript
function findIntersection(arr1, arr2) {
  // Create a Set from the first array for efficient, O(1) average time complexity lookups.
  const set1 = new Set(arr1);
  // Create an empty array to store the common elements.
  const intersection = [];

  // Loop through the second array.
  for (const num of arr2) {
    // Check if the current element from arr2 exists in the Set created from arr1.
    if (set1.has(num)) {
      // If it exists, it's a common element, so add it to our result.
      intersection.push(num);
    }
  }

  // To ensure the result contains only unique common elements, convert it to a Set and back to an array.
  // This step is important if arr2 has duplicates of common numbers.
  return [...new Set(intersection)];
}
```

**18. Find All Unique Elements: Write a function that returns only the unique elements from an array.**

```javascript
function findUniqueElements(arr) {
  // A Set is a data structure that, by definition, only stores unique values.
  // We can convert the array to a Set to automatically remove all duplicates.
  const uniqueSet = new Set(arr);

  // The spread syntax (...) can be used to convert the Set back into an array.
  const uniqueArray = [...uniqueSet];

  // Return the new array containing only the unique elements.
  return uniqueArray;
}```

**19. Wave Array: Sort an array in a wave-like pattern, such that 
`arr[0] >= arr[1] <= arr[2] >= arr[3]...`.**

```javascript
function waveArray(arr) {
  // First, sort the array in ascending order.
  // This makes it easy to create the wave pattern by swapping adjacent elements.
  arr.sort((a, b) => a - b);

  // Loop through the sorted array, but only on even indices (0, 2, 4, ...).
  // We increment by 2 in each step.
  for (let i = 0; i < arr.length - 1; i += 2) {
    // Swap the element at the even index with the element at the next odd index.
    // This creates the a >= b <= c pattern.
    const temp = arr[i];
    arr[i] = arr[i + 1];
    arr[i + 1] = temp;
  }

  // Return the modified array.
  return arr;
}
```

**20. Three Sum: Find all unique triplets in the array which give the sum of zero.**

```javascript
function threeSum(nums) {
  // Create an array to store the resulting triplets.
  const result = [];
  // If the array has fewer than 3 elements, it's impossible to form a triplet.
  if (nums.length < 3) {
    return result;
  }

  // Sort the array. This is crucial for the two-pointer approach and for skipping duplicates.
  nums.sort((a, b) => a - b);

  // Loop through the array. This loop will fix one number of the potential triplet.
  for (let i = 0; i < nums.length - 2; i++) {
    // If the current number is the same as the previous one, skip it to avoid duplicate triplets.
    if (i > 0 && nums[i] === nums[i - 1]) {
      continue;
    }

    // Use the two-pointer technique for the rest of the array.
    let left = i + 1; // Left pointer starts right after the fixed number.
    let right = nums.length - 1; // Right pointer starts at the end of the array.

    // While the two pointers haven't crossed.
    while (left < right) {
      // Calculate the sum of the three numbers.
      const sum = nums[i] + nums[left] + nums[right];

      // Check if the sum is zero.
      if (sum === 0) {
        // If it is, we found a triplet. Add it to our result.
        result.push([nums[i], nums[left], nums[right]]);

        // To avoid duplicate triplets, move the pointers past any duplicate numbers.
        while (left < right && nums[left] === nums[left + 1]) left++;
        while (left < right && nums[right] === nums[right - 1]) right--;

        // Move pointers inward to look for the next potential triplet.
        left++;
        right--;
      }
      // If the sum is less than zero, we need a larger sum, so move the left pointer to the right.
      else if (sum < 0) {
        left++;
      }
      // If the sum is greater than zero, we need a smaller sum, so move the right pointer to the left.
      else {
        right--;
      }
    }
  }

  // Return the array of all unique triplets that sum to zero.
  return result;
}
```

Of course. Let's move on to the string manipulation questions.

### **String Manipulation Questions**

String-related problems are essential for frontend developers who constantly work with UI text, user input, and data formatting.

**21. Reverse a String: Write a function to reverse the characters of a given string.**

```javascript
function reverseString(str) {
  // Create an empty string to build the reversed version.
  let reversedStr = '';

  // Loop through the original string backwards, from the last character to the first.
  for (let i = str.length - 1; i >= 0; i--) {
    // Append each character to the new reversed string.
    reversedStr += str[i];
  }

  // Return the fully reversed string.
  return reversedStr;
}
```

**22. Valid Palindrome: Check if a given string is a palindrome, ignoring non-alphanumeric characters and case.**

```javascript
function isPalindrome(s) {
  // First, clean the string:
  // 1. Convert to lowercase to ignore case.
  // 2. Remove all non-alphanumeric characters using a regular expression.
  // The regex /[^a-z0-9]/g matches any character that is NOT a lowercase letter or a digit.
  const cleanedStr = s.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Initialize two pointers, one at the beginning and one at the end of the cleaned string.
  let left = 0;
  let right = cleanedStr.length - 1;

  // Loop as long as the left pointer is to the left of the right pointer.
  while (left < right) {
    // Compare the characters at the left and right pointers.
    if (cleanedStr[left] !== cleanedStr[right]) {
      // If they don't match at any point, it's not a palindrome.
      return false;
    }

    // Move the pointers inward for the next comparison.
    left++;
    right--;
  }

  // If the loop completes without finding any mismatches, it is a palindrome.
  return true;
}
```

**23. Valid Anagram: Determine if two strings are anagrams of each other.**

```javascript
function isAnagram(s, t) {
  // Anagrams must have the same length. If they don't, they can't be anagrams.
  if (s.length !== t.length) {
    return false;
  }

  // Create a frequency map (using an object) to count characters in the first string.
  const charCount = {};

  // Loop through the first string to build the frequency map.
  for (const char of s) {
    // For each character, increment its count. If it's not in the map, initialize it to 1.
    charCount[char] = (charCount[char] || 0) + 1;
  }

  // Loop through the second string to check against the map.
  for (const char of t) {
    // If a character from the second string is not in the map, or its count is zero,
    // it means the strings can't be anagrams.
    if (!charCount[char]) {
      return false;
    }
    // Decrement the count for the character found.
    charCount[char]--;
  }

  // If the loop completes, it means every character in `t` was accounted for in `s`.
  // Since we already checked that the lengths are equal, they must be anagrams.
  return true;
}
```

**24. Longest Substring Without Repeating Characters: Find the length of the longest substring without any repeating characters.**

```javascript
function lengthOfLongestSubstring(s) {
  // Initialize the length of the longest substring found so far.
  let maxLength = 0;
  // Initialize the starting pointer of our sliding window.
  let start = 0;
  // Use a Map to store the most recent index of each character in the current window.
  const charIndexMap = new Map();

  // Loop through the string with the 'end' pointer of our sliding window.
  for (let end = 0; end < s.length; end++) {
    // Get the character at the current end position.
    const currentChar = s[end];

    // Check if the current character is already in our map and its index is within the current window.
    if (charIndexMap.has(currentChar) && charIndexMap.get(currentChar) >= start) {
      // If it is, a repeat has been found.
      // Move the start of our window to the position right after the last occurrence of this character.
      start = charIndexMap.get(currentChar) + 1;
    }

    // Update the map with the current character's latest position.
    charIndexMap.set(currentChar, end);

    // Calculate the length of the current window (end - start + 1).
    const currentLength = end - start + 1;
    
    // Update the maximum length if the current window is longer.
    maxLength = Math.max(maxLength, currentLength);
  }

  // Return the maximum length found.
  return maxLength;
}
```

**25. Valid Parentheses: Check if a string of brackets `(`, `)`, `{`, `}`, `[` and `]` is balanced.**

```javascript
function isValidParentheses(s) {
  // Use an array as a stack to keep track of opening brackets.
  const stack = [];
  // Create a map to hold the matching pairs of brackets.
  const bracketMap = {
    '(': ')',
    '{': '}',
    '[': ']'
  };

  // Loop through each character of the input string.
  for (const char of s) {
    // If the character is an opening bracket (i.e., a key in our map)...
    if (bracketMap[char]) {
      // ...push it onto the stack.
      stack.push(char);
    } 
    // Otherwise, it must be a closing bracket.
    else {
      // If the stack is empty, there's no opening bracket to match this closing one.
      if (stack.length === 0) {
        return false;
      }
      // Pop the last opening bracket from the stack.
      const lastOpen = stack.pop();
      // Check if the current closing bracket is the correct match for the last opening one.
      if (bracketMap[lastOpen] !== char) {
        // If it's not a match, the string is not balanced.
        return false;
      }
    }
  }

  // After the loop, if the stack is empty, all brackets were correctly matched and closed.
  // If the stack is not empty, it means there are unclosed opening brackets.
  return stack.length === 0;
}
```

Of course. I will continue providing answers until all 50 questions are completed.

**26. String to Integer (atoi): Implement a function that converts a string to an integer.**

```javascript
function myAtoi(s) {
  // Use JavaScript's built-in parseInt function, which is designed for this exact purpose.
  // It handles whitespace, signs (+/-), and stops parsing when it hits a non-numeric character.
  const integer = parseInt(s, 10); // The 10 is the radix, specifying base-10.

  // parseInt returns NaN (Not a Number) if the first non-whitespace character can't be converted.
  // We'll return 0 in that case, as is common for atoi implementations.
  if (isNaN(integer)) {
    return 0;
  }

  // Define the 32-bit signed integer limits.
  const INT_MAX = 2**31 - 1;
  const INT_MIN = -(2**31);

  // Clamp the result to the 32-bit signed integer range.
  if (integer > INT_MAX) {
    return INT_MAX;
  }
  if (integer < INT_MIN) {
    return INT_MIN;
  }

  // Return the parsed and clamped integer.
  return integer;
}
```

**27. Implement `strStr()`: Find the first occurrence of a "needle" string within a "haystack" string.**

```javascript
function strStr(haystack, needle) {
  // If the needle is an empty string, it's considered to be found at the start.
  if (needle.length === 0) {
    return 0;
  }

  // If the haystack is shorter than the needle, the needle can't be inside it.
  if (haystack.length < needle.length) {
    return -1;
  }

  // Loop through the haystack. We only need to go as far as it's possible for the needle to fit.
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    // Assume we have found a match until proven otherwise.
    let matchFound = true;
    // Check if the substring of haystack starting at `i` matches the needle.
    for (let j = 0; j < needle.length; j++) {
      // If any character doesn't match...
      if (haystack[i + j] !== needle[j]) {
        // ...it's not a match. Break the inner loop.
        matchFound = false;
        break;
      }
    }
    // If the inner loop completed without finding a mismatch...
    if (matchFound) {
      // ...we have found the needle's first occurrence. Return its starting index.
      return i;
    }
  }

  // If the loop finishes without returning, the needle was not found.
  return -1;
}```

**28. Longest Common Prefix: Find the longest common prefix string amongst an array of strings.**

```javascript
function longestCommonPrefix(strs) {
  // If the input array is empty, there's no common prefix.
  if (!strs || strs.length === 0) {
    return "";
  }

  // Start by assuming the first string is the entire common prefix.
  let prefix = strs[0];

  // Loop through the rest of the strings in the array, starting from the second one.
  for (let i = 1; i < strs.length; i++) {
    // Keep shortening the prefix until it's found at the beginning of the current string.
    // The `indexOf` method returns 0 if the substring is found at the start.
    while (strs[i].indexOf(prefix) !== 0) {
      // If not found at the start, shorten the prefix by removing the last character.
      prefix = prefix.substring(0, prefix.length - 1);
      // If the prefix becomes empty, there's no common prefix at all.
      if (prefix === "") {
        return "";
      }
    }
  }

  // The remaining prefix is the longest one common to all strings.
  return prefix;
}
```

**29. Count Vowels: Write a function that counts the number of vowels in a string.**

```javascript
function countVowels(str) {
  // Initialize a counter for the vowels.
  let vowelCount = 0;
  // Define a string containing all vowels (both cases) for easy lookup.
  const vowels = "aeiouAEIOU";

  // Loop through each character of the input string.
  for (const char of str) {
    // Check if the current character is included in our vowels string.
    if (vowels.includes(char)) {
      // If it is, increment the counter.
      vowelCount++;
    }
  }

  // Return the total count.
  return vowelCount;
}
```

**30. Capitalize Words: Create a function that capitalizes the first letter of each word in a sentence.**

```javascript
function capitalizeWords(sentence) {
  // Split the sentence into an array of words.
  const words = sentence.split(' ');

  // Loop through each word in the array.
  for (let i = 0; i < words.length; i++) {
    // Get the current word.
    const word = words[i];
    // Check if the word is not empty.
    if (word.length > 0) {
      // Create the capitalized version:
      // - Take the first character and make it uppercase.
      // - Take the rest of the word (from the second character onwards).
      // - Concatenate them back together.
      words[i] = word[0].toUpperCase() + word.substring(1);
    }
  }

  // Join the words back into a single string, separated by spaces.
  return words.join(' ');
}
```

**31. String Compression: Implement a method to perform basic string compression using the counts of repeated characters (e.g., "aabcccccaaa" would become "a2b1c5a3").**

```javascript
function compressString(str) {
  // If the string is empty, return an empty string.
  if (str.length === 0) {
    return "";
  }

  // Initialize an empty string to build the compressed result.
  let compressed = '';
  // Initialize a counter for the current character sequence.
  let count = 1;

  // Loop through the string.
  for (let i = 0; i < str.length; i++) {
    // Check if the current character is the same as the next one.
    if (str[i] === str[i + 1]) {
      // If it is, just increment the counter.
      count++;
    } else {
      // If it's different (or we're at the end of the string),
      // append the character and its count to the result.
      compressed += str[i] + count;
      // Reset the counter for the next new character.
      count = 1;
    }
  }

  // The problem often states to return the original string if the compressed one isn't shorter.
  return compressed.length < str.length ? compressed : str;
}
```

**32. Template Literals: Explain the use and benefits of template literals for string formatting in ES6.**

**Answer:**

Template literals are a feature introduced in ES6 that provide a more powerful and readable way to create strings in JavaScript. They are enclosed by backticks (`` ` ``) instead of single or double quotes.

**Key Uses and Benefits:**

1.  **Easier String Interpolation:** You can embed variables and expressions directly into the string using the `${expression}` syntax. This is much cleaner and more intuitive than traditional string concatenation with the `+` operator.

    *   **Old Way (Concatenation):**
        ```javascript
        var name = "Alex";
        var message = "Hello, " + name + "! Welcome to our site.";
        ```
    *   **New Way (Template Literal):**
        ```javascript
        const name = "Alex";
        const message = `Hello, ${name}! Welcome to our site.`;
        ```

2.  **Multi-line Strings:** Template literals allow you to create strings that span multiple lines without needing special characters like `\n`. The line breaks inside the backticks are preserved in the final string.

    *   **Old Way:**
        ```javascript
        var html = '<div>\n' +
                   '  <h1>Title</h1>\n' +
                   '</div>';
        ```
    *   **New Way:**
        ```javascript
        const html = `
          <div>
            <h1>Title</h1>
          </div>
        `;
        ```

3.  **Tagged Templates (Advanced):** This is a more advanced feature where you can pass a template literal to a function. The function receives the string parts and the interpolated values, allowing you to parse and manipulate the string in custom ways. This is used in libraries like `styled-components` in React.

In summary, template literals make code more readable, reduce errors from complex concatenation, and simplify the creation of multi-line strings, which is very common in frontend development for tasks like creating HTML templates.

---
### **Object-Related Questions**

**33. Deep Clone an Object: Write a function to create a deep copy of a JavaScript object, handling nested objects and arrays.**

```javascript
function deepClone(obj) {
  // Handle primitive types and null. If it's not an object, it doesn't need cloning.
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Determine if the object is an array or a regular object and create the initial copy.
  const clone = Array.isArray(obj) ? [] : {};

  // Iterate over all the keys in the original object.
  for (const key in obj) {
    // Ensure the key belongs to the object itself, not its prototype chain.
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Get the value of the property.
      const value = obj[key];
      // Recursively call deepClone on the value.
      // If the value is an object or array, it will be cloned.
      // If it's a primitive, it will be returned as is by the base case.
      clone[key] = deepClone(value);
    }
  }

  // Return the fully cloned object.
  return clone;
}
```

**34. Shallow vs. Deep Copy: Explain the difference between a shallow copy and a deep copy of an object.**

**Answer:**

The difference between a shallow and a deep copy lies in how they handle nested objects and arrays.

*   **Shallow Copy:**
    A shallow copy creates a new object, but it only copies the properties of the original object at the top level. If a property's value is a primitive type (like a number or string), the value is copied. However, if a property's value is a reference to another object or array, only the **reference** (the memory address) is copied, not the nested object itself.

    **Implication:** Both the original object and its shallow copy will point to the *exact same* nested object. If you modify the nested object through the copy, the change will also be reflected in the original object, and vice-versa.

    *   **Example (Shallow Copy):**
        ```javascript
        const original = { a: 1, b: { c: 2 } };
        const shallowCopy = { ...original }; // or Object.assign({}, original)

        shallowCopy.b.c = 99; // Modify the nested object in the copy

        console.log(original.b.c); // Output: 99 (The original is also changed!)
        ```

*   **Deep Copy:**
    A deep copy creates a new object and recursively copies every property and nested object. It does not copy references. It creates a completely new version of every nested object and array, so the copy is fully independent of the original.

    **Implication:** The copy and the original are completely disconnected. Modifying a nested object in the copy will have no effect on the original object.

    *   **Example (Deep Copy):**
        ```javascript
        const original = { a: 1, b: { c: 2 } };
        // Using our deepClone function from the previous question
        const deepCo = deepClone(original);

        deepCopy.b.c = 99; // Modify the nested object in the copy

        console.log(original.b.c); // Output: 2 (The original remains unchanged)
        ```

**In summary:** Use a shallow copy when your object only contains primitive values or when you intentionally want to share nested objects. Use a deep copy when you need a completely independent replica of an object, including all its nested parts.

**35. Merge Two Objects: Combine two objects into one.**

```javascript
function mergeObjects(obj1, obj2) {
  // The spread syntax (...) is the most modern and common way to merge objects.
  // It creates a new object and copies the properties from obj1 first,
  // then copies the properties from obj2.
  // If there are any overlapping keys, the value from the last object (obj2) wins.
  const mergedObject = { ...obj1, ...obj2 };

  // Return the new merged object.
  return mergedObject;
}

// Example:
// const user = { name: "John", role: "Developer" };
// const details = { role: "Senior Developer", location: "New York" };
// const merged = mergeObjects(user, details);
// console.log(merged); // { name: "John", role: "Senior Developer", location: "New York" }
```

**36. Check if an Object Contains a Property: How do you reliably check if an object has a specific property?**

**Answer:**

The most reliable way to check if an object has a specific property *directly on itself* (and not inherited from its prototype) is to use the `Object.prototype.hasOwnProperty.call()` method.

```javascript
const person = {
  name: 'Sarah',
  age: 30
};

// Create an object that inherits from person
const child = Object.create(person);
child.toy = 'Teddy Bear';

// --- Using hasOwnProperty ---

// GOOD: Checks for properties directly on the object.
console.log(Object.prototype.hasOwnProperty.call(child, 'toy'));   // true (toy is its own property)
console.log(Object.prototype.hasOwnProperty.call(child, 'name'));  // false (name is inherited)

// --- Why not other methods? ---

// 1. Simple dot notation or bracket notation (obj.prop or obj['prop'])
// This is unreliable because the property could exist but have a "falsy" value
// like undefined, null, false, 0, or an empty string.
if (person.age) { /* This code runs */ }
const anotherPerson = { age: 0 };
if (anotherPerson.age) { /* This code DOES NOT run, even though 'age' exists */ }


// 2. The `in` operator
// The `in` operator returns true if the property exists anywhere in the object's
// prototype chain. This is often not what you want.
console.log('toy' in child);  // true
console.log('name' in child); // true (This is true because it found 'name' on the prototype)
```

**Conclusion:** For most cases where you want to check for a key you added to an object yourself, `Object.prototype.hasOwnProperty.call(object, 'property')` is the safest and most precise method.

**37. Deep Object Comparison: Write a function to check if two objects are equal in value (deep equality).**

```javascript
function deepEqual(obj1, obj2) {
  // Check if the two items are strictly the same instance.
  // This handles primitives and the case where obj1 and obj2 are the same object.
  if (obj1 === obj2) {
    return true;
  }

  // Check if either is not an object or is null. If so, they can't be deeply equal.
  // This check is important because `typeof null` is 'object'.
  if (obj1 === null || typeof obj1 !== 'object' || obj2 === null || typeof obj2 !== 'object') {
    return false;
  }

  // Get the keys of both objects.
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  // If they don't have the same number of keys, they can't be equal.
  if (keys1.length !== keys2.length) {
    return false;
  }

  // Iterate over the keys of the first object.
  for (const key of keys1) {
    // Check if the second object also has this key.
    if (!keys2.includes(key)) {
      return false;
    }
    // Recursively call deepEqual on the values of the current key.
    // If any nested comparison returns false, the objects are not equal.
    if (!deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  // If all keys and their corresponding values passed the checks, the objects are deeply equal.
  return true;
}
```

**38. Add Dynamic Key-Value Pairs: Demonstrate how to add properties to an object where the key is a variable.**

**Answer:**

You can add a property to an object using a variable as the key by using **computed property names** with bracket notation `[]`.

```javascript
// The object we want to add a property to.
const userProfile = {
  id: 123,
  username: 'flynn'
};

// The variable that holds the key name we want to add.
const newPropertyName = 'country';

// The value we want to assign to the new property.
const propertyValue = 'USA';

// Use bracket notation to add the dynamic key-value pair.
userProfile[newPropertyName] = propertyValue;

// The object is now updated.
console.log(userProfile);
// Output: { id: 123, username: 'flynn', country: 'USA' }

// You can also use computed property names directly when creating an object.
const dynamicKey = 'email';
const userWithEmail = {
  name: 'Alice',
  [dynamicKey]: 'alice@example.com'
};
console.log(userWithEmail);
// Output: { name: 'Alice', email: 'alice@example.com' }
```

**39. `JSON.stringify` Usage: Explain what `JSON.stringify` does and its common use cases.**

**Answer:**

`JSON.stringify()` is a JavaScript method that converts a JavaScript object or value into a JSON (JavaScript Object Notation) string.

**What it does:**
It takes a JavaScript object, array, or primitive value as input and returns a string representation of it. This process is often called **serialization**. The resulting string follows the JSON format rules, which is a universal, language-independent data format.

*   Objects are converted to `{"key": "value"}` strings.
*   Arrays are converted to `[1, "hello", null]` strings.
*   `undefined`, functions, and symbols are ignored or converted to `null` when found inside an object or array.

**Common Use Cases:**

1.  **Sending Data to a Server (API Requests):** This is the most common use case. When you send data from a frontend application to a backend server (e.g., in the body of a `POST` or `PUT` request), the data must be in a string format. `JSON.stringify` converts your JavaScript state object into a JSON string that can be included in the HTTP request.

    ```javascript
    const userData = { name: "Sam", level: 99 };
    fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // The body must be a string.
      body: JSON.stringify(userData),
    });
    ```

2.  **Storing Data in `localStorage` or `sessionStorage`:** The browser's web storage APIs can only store strings. To store a complex object or array, you must first serialize it with `JSON.stringify`. When you retrieve it, you must parse it back into an object with `JSON.parse()`.

    ```javascript
    // Storing data
    const settings = { theme: 'dark', notifications: true };
    localStorage.setItem('userSettings', JSON.stringify(settings));

    // Retrieving data later
    const storedSettings = localStorage.getItem('userSettings'); // This is a string
    const settingsObject = JSON.parse(storedSettings); // Now it's an object again
    console.log(settingsObject.theme); // "dark"
    ```

3.  **Deep-Cloning (Simple Cases):** A common "trick" for deep-cloning an object is to stringify it and then parse it. This works for simple objects that contain only JSON-safe values (no `undefined`, functions, `Date` objects, etc.).

    ```javascript
    const original = { a: 1, b: { c: 2 } };
    const clone = JSON.parse(JSON.stringify(original));
    ```

**40. Object Destructuring: Demonstrate how to use object destructuring to extract properties from an object.**

**Answer:**

Object destructuring is an ES6 feature that provides a concise way to extract values from objects and arrays and assign them to variables.

```javascript
const user = {
  id: 42,
  is_verified: true,
  data: {
    firstName: 'John',
    lastName: 'Doe',
    location: {
      city: 'New York',
      country: 'USA'
    }
  }
};

// --- Basic Destructuring ---
// Extracts firstName and lastName from user.data into variables with the same name.
const { firstName, lastName } = user.data;
console.log(firstName); // "John"
console.log(lastName);  // "Doe"


// --- Renaming Variables ---
// Extracts the 'city' property but renames the variable to 'userCity'.
const { city: userCity } = user.data.location;
console.log(userCity); // "New York"


// --- Providing Default Values ---
// Tries to extract 'role'. Since it doesn't exist, it uses the default value 'Guest'.
const { role = 'Guest' } = user.data;
console.log(role); // "Guest"


// --- Nested Destructuring ---
// A more advanced pattern to extract from nested objects in one go.
// Extracts 'city' and renames 'country' to 'userCountry' from the nested location object.
const { location: { city, country: userCountry } } = user.data;
console.log(city);        // "New York"
console.log(userCountry); // "USA"


// --- Using in Function Parameters ---
// Destructuring is very useful for cleanly accessing properties from an options object.
function showUser({ data: { firstName, lastName } }) {
  console.log(`User: ${firstName} ${lastName}`);
}
showUser(user); // "User: John Doe"
```

**41. The `in` operator vs. `hasOwnProperty`: Explain the difference between these two methods for checking property existence.**

**Answer:**

Both the `in` operator and the `hasOwnProperty` method are used to check for the existence of a property on an object, but they differ in one critical aspect: **the prototype chain**.

*   **`in` operator:**
    The `in` operator checks if a property exists on an object **or anywhere in its prototype chain**. It returns `true` if the property is found on the object itself or on any of its ancestors.

*   **`hasOwnProperty`:**
    The `hasOwnProperty` method checks if a property exists **directly on the object itself**. It returns `true` only if the property is a "direct" or "own" property of the object and is not inherited from the prototype chain.

**Example Demonstration:**

```javascript
// Create a "parent" object
const parent = {
  parentProp: 'I am from the parent'
};

// Create a "child" object that inherits from the parent
const child = Object.create(parent);
child.childProp = 'I am from the child';

// --- Check for child's own property ---
console.log('childProp' in child);                    // true (found on child)
console.log(child.hasOwnProperty('childProp'));       // true (found on child)

// --- Check for inherited property ---
console.log('parentProp' in child);                   // true (found on the prototype chain)
console.log(child.hasOwnProperty('parentProp'));      // false (this is the key difference)

// --- Check for non-existent property ---
console.log('nonExistentProp' in child);              // false
console.log(child.hasOwnProperty('nonExistentProp')); // false
```

**Conclusion:**

*   Use `in` when you don't care where the property comes from and just want to know if you can access `obj.prop` without an error.
*   Use `hasOwnProperty` (the more common case) when you need to iterate over an object's keys and want to ignore any inherited properties. This is crucial for preventing unintended behavior from modified or extended object prototypes.

**42. `Object.keys`, `Object.values`, and `Object.entries`: Describe the purpose and return value of each of these methods.**

**Answer:**

These three static methods on the `Object` constructor are used to extract an object's properties into an array format, which is very useful for iteration. They all operate only on an object's **own enumerable properties** (ignoring inherited ones).

*   **`Object.keys(obj)`:**
    *   **Purpose:** To get an array of an object's property keys (the names of the properties).
    *   **Return Value:** An array of strings.
    *   **Example:**
        ```javascript
        const car = { make: 'Toyota', model: 'Camry', year: 2021 };
        const keys = Object.keys(car);
        console.log(keys); // ['make', 'model', 'year']
        ```

*   **`Object.values(obj)`:**
    *   **Purpose:** To get an array of an object's property values.
    *   **Return Value:** An array containing the values of the properties. The data types of the elements will match the data types of the values.
    *   **Example:**
        ```javascript
        const car = { make: 'Toyota', model: 'Camry', year: 2021 };
        const values = Object.values(car);
        console.log(values); // ['Toyota', 'Camry', 2021]
        ```

*   **`Object.entries(obj)`:**
    *   **Purpose:** To get an array of an object's key-value pairs.
    *   **Return Value:** An array of arrays, where each inner array is a `[key, value]` pair.
    *   **Example:**
        ```javascript
        const car = { make: 'Toyota', model: 'Camry', year: 2021 };
        const entries = Object.entries(car);
        console.log(entries);
        // [
        //   ['make', 'Toyota'],
        //   ['model', 'Camry'],
        //   ['year', 2021]
        // ]
        ```

This method is particularly useful with `for...of` loops and destructuring for easy iteration over both the key and value simultaneously:
```javascript
for (const [key, value] of Object.entries(car)) {
  console.log(`${key}: ${value}`);
}
```

**43. Create a function to transform object values: For example, write a function that takes an object and multiplies all of its numeric property values by two.**

```javascript
function transformNumericValues(obj) {
  // Create a new object to store the transformed data, to avoid modifying the original object (immutability).
  const newObj = {};

  // Iterate over the keys of the input object.
  for (const key in obj) {
    // Check if the key is an "own" property of the object.
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Get the value associated with the key.
      const value = obj[key];

      // Check if the value is of the 'number' type.
      if (typeof value === 'number') {
        // If it's a number, multiply it by 2 and assign it to the new object.
        newObj[key] = value * 2;
      } else {
        // If it's not a number, just copy the original value over.
        newObj[key] = value;
      }
    }
  }

  // Return the new object with the transformed values.
  return newObj;
}

// Example:
// const data = { a: 1, b: 'hello', c: 5, d: false, e: 10 };
// const transformedData = transformNumericValues(data);
// console.log(transformedData); // { a: 2, b: 'hello', c: 10, d: false, e: 20 }
```

**44. Explain `this` in the context of an object's method.**

**Answer:**

In JavaScript, the `this` keyword is a special identifier whose value is determined by how a function is called. This is known as the **call-site**. In the context of an object's method, `this` most commonly refers to **the object that the method was called on**.

It essentially provides a way for a method to access other properties of the object it belongs to.

**Standard Function in a Method:**

When a regular function `function() {}` is used as a method, `this` refers to the object to the left of the dot (`.`) at the time of the call.

```javascript
const user = {
  name: 'Leo',
  // This is a method on the 'user' object.
  greet: function() {
    // Because greet() was called as user.greet(), 'this' inside greet refers to 'user'.
    console.log(`Hello, my name is ${this.name}.`);
  }
};

user.greet(); // Output: Hello, my name is Leo.
```

**Arrow Functions in a Method:**

Arrow functions `() => {}` behave differently. They do not have their own `this` binding. Instead, they **lexically inherit** `this` from their surrounding (parent) scope at the time they are defined.

This makes them unsuitable for top-level methods on an object if you need to access the object's properties, because their surrounding scope is often the global scope (`window` in browsers).

```javascript
const userWithArrow = {
  name: 'Mia',
  // Arrow functions inherit 'this' from their parent scope.
  // Here, the parent scope is the global scope where 'userWithArrow' is defined.
  // The global 'this.name' is likely undefined.
  sayName: () => {
    console.log(`My name is ${this.name}.`);
  }
};

userWithArrow.sayName(); // Output: My name is undefined. (or the global name, if set)
```

**Conclusion:** When defining a method on an object that needs to refer to the object itself, **always use a standard function declaration (`function() {}`) or the shorthand method syntax** (`greet() {}`), not an arrow function.

```javascript
const person = {
  name: 'Zoe',
  // Shorthand method syntax also works correctly.
  introduce() {
    console.log(`I'm ${this.name}.`); // 'this' correctly refers to 'person'
  }
};
person.introduce(); // Output: I'm Zoe.
```

---
### **Frontend-Specific Application Problems**

**45. Implement a Debounce Function: Write a debounce function from scratch, which is critical for performance in handling events like search input or window resizing.**

```javascript
function debounce(func, delay) {
  // This variable will hold the timer ID. It's kept in the closure.
  let timeoutId;

  // The debounce function returns a new function.
  // This new function is what will actually be called by the event listener.
  return function(...args) {
    // 'this' will be the context of how the debounced function is called.
    // 'args' will be the arguments passed to it.
    const context = this;

    // Whenever the returned function is called, clear the previous timer.
    // This cancels the previously scheduled execution of 'func'.
    clearTimeout(timeoutId);

    // Set a new timer.
    // The original function 'func' will be called after the 'delay' has passed.
    timeoutId = setTimeout(() => {
      // Use .apply() to call the original function with the correct 'this' context and arguments.
      func.apply(context, args);
    }, delay);
  };
}

// --- HOW TO USE IT ---
// const searchInput = document.getElementById('search');
//
// // The function we want to debounce.
// const handleSearch = (event) => {
//   console.log('Searching for:', event.target.value);
// };
//
// // Create the debounced version of our handler.
// // The API call will only happen 250ms after the user stops typing.
// const debouncedSearch = debounce(handleSearch, 250);
//
// // Attach the debounced function as the event listener.
// searchInput.addEventListener('input', debouncedSearch);
```

**46. Implement a Throttle Function: Write a throttle function to limit the execution of a function to once every specified period, often used for scroll or mouse-move events.**

```javascript
function throttle(func, limit) {
  // This variable tracks whether we are currently in a "cooldown" period.
  let inThrottle;
  // This variable will hold the timer ID.
  let timeoutId;

  // The throttle function returns a new function.
  return function(...args) {
    // Capture the context and arguments.
    const context = this;

    // If we are not in the cooldown period...
    if (!inThrottle) {
      // ...execute the function immediately.
      func.apply(context, args);
      // ...enter the cooldown period.
      inThrottle = true;
      // ...and set a timer to exit the cooldown period after the specified limit.
      timeoutId = setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// --- HOW TO USE IT ---
// const handleScroll = () => {
//   console.log('User scrolled! Performing some heavy calculation.');
// };
//
// // Throttle the scroll handler to only run once every 100 milliseconds.
// // This prevents the heavy calculation from running hundreds of times during a single scroll gesture.
// const throttledScrollHandler = throttle(handleScroll, 100);
//
// window.addEventListener('scroll', throttledScrollHandler);
```

**47. Implement an LRU Cache: Design and implement a Least Recently Used (LRU) cache, commonly used for caching API responses.**

**Answer:**

An LRU (Least Recently Used) Cache is a data structure that stores a limited number of items. When it's full and a new item needs to be added, it discards the item that was accessed the longest time ago.

We can implement this efficiently using a `Map` in JavaScript. A `Map` maintains the insertion order of its keys, which we can leverage to track which key is the least recently used.

```javascript
class LRUCache {
  // The constructor initializes the cache with a maximum capacity.
  constructor(capacity) {
    this.capacity = capacity; // The maximum number of items the cache can hold.
    this.cache = new Map();   // The Map will store our key-value pairs.
  }

  // get(key): Retrieves an item from the cache.
  get(key) {
    // If the key does not exist in the cache, return -1.
    if (!this.cache.has(key)) {
      return -1;
    }

    // --- This is the core "recently used" logic ---
    // Get the value associated with the key.
    const value = this.cache.get(key);
    // Delete the key-value pair from its current position in the map.
    this.cache.delete(key);
    // Re-insert the key-value pair. Because Map preserves insertion order,
    // this effectively moves the key to the "end" of the map, marking it as most recently used.
    this.cache.set(key, value);

    // Return the value.
    return value;
  }

  // put(key, value): Adds or updates an item in the cache.
  put(key, value) {
    // If the key already exists, we just need to update its value and mark it as recently used.
    // Deleting it first is the easiest way to handle this before re-inserting it.
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Check if the cache is at full capacity.
    else if (this.cache.size >= this.capacity) {
      // The cache is full, so we must evict the least recently used item.
      // In a Map, the first item is the oldest (least recently inserted/used).
      // `this.cache.keys()` returns an iterator. `.next().value` gets the first key.
      const leastRecentlyUsedKey = this.cache.keys().next().value;
      // Delete the oldest item.
      this.cache.delete(leastRecentlyUsedKey);
    }

    // Add the new key-value pair to the cache. It becomes the most recently used item.
    this.cache.set(key, value);
  }
}

// --- HOW TO USE IT ---
// const myCache = new LRUCache(2); // Create a cache with a capacity of 2
// myCache.put(1, 'A'); // Cache is {1: 'A'}
// myCache.put(2, 'B'); // Cache is {1: 'A', 2: 'B'}
// console.log(myCache.get(1)); // Returns 'A'. Cache is now {2: 'B', 1: 'A'} (1 is most recent)
// myCache.put(3, 'C'); // Cache is full. Evicts key 2. Cache is {1: 'A', 3: 'C'}
// console.log(myCache.get(2)); // Returns -1 (was evicted)
```

**48. Implement `curry()`: Write a function that performs currying, transforming a function that takes multiple arguments into a sequence of functions that each take a single argument.**

**Answer:**

Currying is a functional programming technique. A `curry` function takes a function `fn` that accepts multiple arguments and returns a new function. This new function can be called with one argument at a time. It will keep returning new functions—each accepting one argument—until it has received all the arguments `fn` expects. At that point, it will execute the original function `fn` with all the collected arguments.

```javascript
function curry(fn) {
  // The 'curry' function returns a new "curried" function.
  // It takes an initial set of arguments.
  return function curried(...args) {
    // 'fn.length' gives the number of arguments the original function 'fn' expects.
    // If the number of arguments we've collected so far ('args.length') is enough...
    if (args.length >= fn.length) {
      // ...then execute the original function 'fn' with those arguments.
      return fn.apply(this, args);
    } else {
      // ...otherwise, we need more arguments.
      // Return a new function that will accept the *next* set of arguments ('args2').
      return function(...args2) {
        // When this inner function is called, it will call 'curried' again,
        // passing a concatenated list of the old arguments and the new ones.
        return curried.apply(this, args.concat(args2));
      };
    }
  };
}

// --- HOW TO USE IT ---
// A simple function that takes three arguments.
function sum(a, b, c) {
  return a + b + c;
}

// Create a curried version of the sum function.
const curriedSum = curry(sum);

// Now we can call it in different ways:
console.log(curriedSum(1, 2, 3)); // 6 (works like the original)
console.log(curriedSum(1)(2, 3)); // 6
console.log(curriedSum(1)(2)(3)); // 6

const add5 = curriedSum(5); // Create a new function that already has the first argument '5'.
const add5and3 = add5(3); // Create a new function that has '5' and '3'.

console.log(add5and3(10)); // 18 (5 + 3 + 10)
console.log(add5(8, 2));   // 15 (5 + 8 + 2)
```

**49. Flatten an object: Write a function that takes a nested object and returns a single-level object with dot-separated keys (e.g., `{ a: { b: 1 } }` becomes `{ 'a.b': 1 }`).**

```javascript
function flattenObject(obj) {
  // Initialize an empty object to store the flattened result.
  const flattened = {};

  // Create a recursive inner function to process the object.
  // It takes the current object and the path/prefix built so far.
  function process(currentObj, prefix) {
    // Iterate over all keys in the current object.
    for (const key in currentObj) {
      // Make sure it's an own property.
      if (Object.prototype.hasOwnProperty.call(currentObj, key)) {
        // Construct the new key by joining the prefix and the current key with a dot.
        // If there's no prefix yet, the new key is just the current key.
        const newKey = prefix ? `${prefix}.${key}` : key;
        // Get the value of the property.
        const value = currentObj[key];

        // Check if the value is a non-null object and not an array.
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // If it's another object, recurse deeper, passing the nested object and the new key as the prefix.
          process(value, newKey);
        } else {
          // If it's a primitive, an array, or null, assign the value to the new key in our result object.
          flattened[newKey] = value;
        }
      }
    }
  }

  // Start the process with the initial object and an empty prefix.
  process(obj, '');

  // Return the flattened object.
  return flattened;
}

// --- HOW TO USE IT ---
// const nested = {
//   a: 1,
//   b: {
//     c: 'hello',
//     d: {
//       e: true
//     }
//   },
//   f:
// };
//
// const flat = flattenObject(nested);
// console.log(flat);
// // Output:
// // {
// //   'a': 1,
// //   'b.c': 'hello',
// //   'b.d.e': true,
// //   'f':
// // }
```

**50. Implement Infinite Scrolling Logic: Outline the data structure and logic to manage data fetching and display for an infinite scroll feature.**

**Answer:**

Implementing infinite scrolling involves managing state, handling API calls, and listening to user scroll events. Here is an outline of the data structures and logic.

**1. State Management (Data Structures)**

You need to keep track of several pieces of state in your frontend component:

*   **`items` (Array):** This array will hold all the data items that have been fetched and are currently displayed on the page.
    *   Example: `const [items, setItems] = useState([]);`
*   **`page` (Number):** This tracks the current page number for API requests. You'll increment this to fetch the next batch of data.
    *   Example: `const [page, setPage] = useState(1);`
*   **`isLoading` (Boolean):** A flag to prevent multiple API calls from being made simultaneously. When a fetch is in progress, this should be `true`.
    *   Example: `const [isLoading, setIsLoading] = useState(false);`
*   **`hasMore` (Boolean):** A flag to indicate if there is more data to be fetched from the server. When the API returns an empty array or a specific signal, this should be set to `false` to stop trying to fetch more.
    *   Example: `const [hasMore, setHasMore] = useState(true);`

**2. Core Logic Flow**

**a. Initial Data Fetch:**
*   When the component first mounts (e.g., in a `useEffect` hook in React), make the initial API call to fetch the first page of data.
*   The `fetchData` function will be an `async` function.

**b. `fetchData` Function:**
1.  **Guard Clause:** If `isLoading` is `true` or `hasMore` is `false`, exit the function immediately.
2.  **Set Loading State:** Set `setIsLoading(true)`.
3.  **API Call:** Make an API request to your backend, including the current `page` number in the query.
    *   Example: `fetch('/api/items?page=' + page + '&limit=10')`.
4.  **Process Response:**
    *   When the data arrives, check if the returned array of new items is empty. If it is, set `setHasMore(false)`.
    *   Append the new items to your existing `items` array: `setItems(prevItems => [...prevItems, ...newItems]);`.
    *   Increment the page number for the next fetch: `setPage(prevPage => prevPage + 1);`.
5.  **Reset Loading State:** Set `setIsLoading(false)`.

**c. Scroll Event Listener:**
1.  **Attach Listener:** Attach a scroll event listener to the `window` or a specific scrollable container element. It's crucial to **throttle or debounce** this listener to avoid performance issues.
2.  **Scroll Handler Logic:** The handler function will check if the user has scrolled near the bottom of the page.
    *   The condition for this is typically: `window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - BUFFER`, where `BUFFER` is a small pixel offset (e.g., 100px) to start loading before the user hits the absolute bottom.
3.  **Trigger Fetch:** If the condition is met (and `isLoading` is false), call your `fetchData` function.

**d. Cleanup:**
*   Remember to remove the scroll event listener when the component unmounts to prevent memory leaks. This is done in the return function of a `useEffect` hook.

**3. Pseudocode Example (React-like)**

```javascript
function InfiniteScrollComponent() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Function to fetch data from the API
  const fetchData = async () => {
    if (isLoading || !hasMore) return; // Prevent multiple fetches
    setIsLoading(true);

    const response = await fetch(`/api/items?page=${page}&limit=10`);
    const newItems = await response.json();

    if (newItems.length === 0) {
      setHasMore(false); // No more data to load
    } else {
      setItems(prev => [...prev, ...newItems]); // Append new items
      setPage(prev => prev + 1); // Go to the next page
    }

    setIsLoading(false);
  };

  // Scroll handler
  const handleScroll = () => {
    // Check if user is near the bottom
    if (window.innerHeight + document.documentElement.scrollTop < document.documentElement.offsetHeight - 100) {
      return; // Not near the bottom yet
    }
    fetchData(); // Trigger fetch
  };

  // Set up and clean up scroll listener
  useEffect(() => {
    // Initial data load
    fetchData(); 

    // Use a throttled handler for performance
    const throttledHandleScroll = throttle(handleScroll, 200);
    window.addEventListener('scroll', throttledHandleScroll);

    // Cleanup
    return () => window.removeEventListener('scroll', throttledHandleScroll);
  }, []); // Empty dependency array means this runs only on mount and unmount

  return (
    <div>
      {items.map(item => <div key={item.id}>{item.name}</div>)}
      {isLoading && <p>Loading more items...</p>}
      {!hasMore && <p>You have reached the end!</p>}
    </div>
  );
}
```

**51. Check for Balanced Brackets in a String: Given a string containing only brackets (parentheses `()`, square `[]`, and curly `{}`), determine if the brackets are balanced and properly nested.**

```javascript
function isBalanced(str) {
  // Stack to keep track of opening brackets
  const stack = [];
  // Map of opening to corresponding closing brackets
  const brackets = {
    '(': ')',
    '[': ']',
    '{': '}'
  };

  // Loop through each character in the string
  for (const char of str) {
    // If it's an opening bracket, push to stack
    if (brackets[char]) {
      stack.push(char);
    } else if (Object.values(brackets).includes(char)) {
      // If it's a closing bracket, check for a match
      if (stack.length === 0) {
        // No opening bracket to match
        return false;
      }
      const lastOpen = stack.pop();
      if (brackets[lastOpen] !== char) {
        // Mismatched closing bracket
        return false;
      }
    }
    // Ignore any non-bracket characters (optional, based on requirements)
  }

  // If stack is empty, all brackets were matched
  return stack.length === 0;
}

// Example usage:
let testS = "[{([])}]{}()"; // true
console.log("isBalanced:", isBalanced(testS));

let testS2 = "[{]}"; // false
console.log("isBalanced:", isBalanced(testS2));
```
